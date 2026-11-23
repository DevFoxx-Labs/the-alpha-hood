import { randomBytes } from "node:crypto";
import { type Order, orderNumber, type OrderStatus, type OrderStore } from "@/lib/orders/store";
import { isMongoDuplicate, type MongoConn } from "../mongo";
import type { Primitives } from "../primitives";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx } from "../sql";

/**
 * Orders on the own backend. The order is one JSON document plus indexed columns (number, id, customer,
 * status, idempotency key, created_at). Same guarantees as the memory store (contract-tested):
 * - UNIQUE (customer, idempotency key) and order number;
 * - UNIQUE gateway payment id across orders (`order_payments` table on SQL, a multikey index on MongoDB);
 * - `transition` / `update` are read-patch-write under a row lock (SQL `FOR UPDATE`) or a version check (MongoDB),
 *   so concurrent webhooks, retries and staff actions never lose an update;
 * - processed webhook events and the invoice series use the shared marker / counter primitives.
 */
const newOrderId = () => `ord_${randomBytes(12).toString("hex")}`;
const clone = <T>(v: T): T => structuredClone(v);

// ── SQL ──────────────────────────────────────────────────────────────────────────────────────────

export function createSqlOrderStore(db: SqlDb, p: Primitives): OrderStore {
  const read = (doc: unknown) => fromJson<Order>(doc, null as unknown as Order);
  const one = async (where: "number" | "id", value: string) => {
    const r = await db.selectFrom("orders").select("doc").where(where, "=", value).executeTakeFirst();
    return r ? read(r.doc) : null;
  };
  const list = async (q: (b: ReturnType<typeof base>) => ReturnType<typeof base>) => (await q(base()).execute()).map((r) => read(r.doc));
  const base = () => db.selectFrom("orders").select("doc");

  async function mutate(number: string, from: OrderStatus[] | null, to: OrderStatus | null, patch?: (o: Order) => void): Promise<Order | null> {
    return sqlTx(db, async (trx) => {
      const row = await trx.selectFrom("orders").select(["doc", "version"]).where("number", "=", number).forUpdate().executeTakeFirst();
      if (!row) return null;
      const o = read(row.doc);
      if (from && !from.includes(o.status)) return null;
      if (to) o.status = to;
      patch?.(o);
      await trx.updateTable("orders").set({ doc: JSON.stringify(o), status: o.status, version: row.version + 1 }).where("number", "=", number).execute();
      // Keep the payment-id index in step; a payment id owned by another order violates the PK and aborts.
      for (const a of o.attempts) {
        const owner = await trx.selectFrom("order_payments").select("order_number").where("payment_id", "=", a.paymentId).executeTakeFirst();
        if (owner && owner.order_number !== number) throw new Error("Payment id already belongs to another order");
        if (!owner) await trx.insertInto("order_payments").values({ payment_id: a.paymentId, order_number: number }).execute();
      }
      return clone(o);
    });
  }

  return {
    async create(input) {
      for (let i = 0; i < 5; i++) {
        const order: Order = { ...clone(input), id: newOrderId(), number: orderNumber() };
        try {
          await sqlTx(db, async (trx) => {
            await trx
              .insertInto("orders")
              .values({ number: order.number, id: order.id, customer_id: order.customerId, status: order.status, idempotency_key: order.idempotencyKey, created_at: new Date(order.createdAt), doc: JSON.stringify(order), version: 1 })
              .execute();
            for (const a of order.attempts) await trx.insertInto("order_payments").values({ payment_id: a.paymentId, order_number: order.number }).execute();
          });
          return clone(order);
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
          const dup = await db.selectFrom("orders").select("number").where("customer_id", "=", input.customerId).where("idempotency_key", "=", input.idempotencyKey).executeTakeFirst();
          if (dup) throw new Error("Duplicate idempotency key");
          // else: order-number collision (1 in 32^8) → retry with a new number
        }
      }
      throw new Error("Could not allocate an order number");
    },
    get: (n) => one("number", n),
    async byIdempotency(customerId, key) {
      const r = await base().where("customer_id", "=", customerId).where("idempotency_key", "=", key).executeTakeFirst();
      return r ? read(r.doc) : null;
    },
    async byPaymentId(paymentId) {
      const r = await db.selectFrom("order_payments").select("order_number").where("payment_id", "=", paymentId).executeTakeFirst();
      return r ? one("number", r.order_number) : null;
    },
    listByStatus: (status) => list((b) => b.where("status", "=", status).orderBy("created_at")),
    listByCustomer: (customerId) => list((b) => b.where("customer_id", "=", customerId).orderBy("created_at", "desc")),
    listRecent: (limit) => list((b) => b.orderBy("created_at", "desc").limit(Math.max(1, Math.min(limit, 5000)))),
    async nextInvoiceNumber(fy) {
      const n = await p.next(`invoice:${fy}`);
      return `INV/${fy}/${String(n).padStart(6, "0")}`;
    },
    transition: (number, from, to, patch) => mutate(number, from, to, patch),
    update: (number, patch) => mutate(number, null, null, patch),
    markEvent: (eventId) => p.marker("payment_event", eventId),
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────────────────────────

type OrderDoc = Order & { _id: string; _v: number };

export function createMongoOrderStore(conn: Promise<MongoConn>, p: Primitives): OrderStore {
  const col = async () => (await conn).db.collection<OrderDoc>("orders");
  const strip = (d: OrderDoc | null): Order | null => {
    if (!d) return null;
    const o = clone(d) as Partial<OrderDoc>;
    delete o._id;
    delete o._v;
    return o as Order;
  };

  async function mutate(number: string, from: OrderStatus[] | null, to: OrderStatus | null, patch?: (o: Order) => void): Promise<Order | null> {
    const c = await col();
    for (let i = 0; i < 20; i++) {
      const d = await c.findOne({ _id: number });
      if (!d) return null;
      const o = strip(d)!;
      if (from && !from.includes(o.status)) return null;
      if (to) o.status = to;
      patch?.(o);
      try {
        // Optimistic concurrency: write only if nobody changed the order since we read it.
        const r = await c.replaceOne({ _id: number, _v: d._v }, { ...o, _v: d._v + 1 } as Omit<OrderDoc, "_id">);
        if (r.matchedCount === 1) return clone(o);
      } catch (e) {
        if (isMongoDuplicate(e)) throw new Error("Payment id already belongs to another order");
        throw e;
      }
      await new Promise((res) => setTimeout(res, 5 + Math.random() * 15));
    }
    throw new Error(`Order ${number} is too busy — try again`);
  }

  return {
    async create(input) {
      const c = await col();
      for (let i = 0; i < 5; i++) {
        const order: Order = { ...clone(input), id: newOrderId(), number: orderNumber() };
        try {
          await c.insertOne({ ...order, _id: order.number, _v: 1 });
          return clone(order);
        } catch (e) {
          if (!isMongoDuplicate(e)) throw e;
          if (await c.countDocuments({ customerId: input.customerId, idempotencyKey: input.idempotencyKey })) throw new Error("Duplicate idempotency key");
        }
      }
      throw new Error("Could not allocate an order number");
    },
    async get(n) {
      return strip(await (await col()).findOne({ _id: n }));
    },
    async byIdempotency(customerId, key) {
      return strip(await (await col()).findOne({ customerId, idempotencyKey: key }));
    },
    async byPaymentId(paymentId) {
      return strip(await (await col()).findOne({ "attempts.paymentId": paymentId }));
    },
    async listByStatus(status) {
      return (await (await col()).find({ status }).sort({ createdAt: 1 }).toArray()).map((d) => strip(d)!);
    },
    async listByCustomer(customerId) {
      return (await (await col()).find({ customerId }).sort({ createdAt: -1 }).toArray()).map((d) => strip(d)!);
    },
    async listRecent(limit) {
      return (await (await col()).find().sort({ createdAt: -1 }).limit(Math.max(1, Math.min(limit, 5000))).toArray()).map((d) => strip(d)!);
    },
    async nextInvoiceNumber(fy) {
      const n = await p.next(`invoice:${fy}`);
      return `INV/${fy}/${String(n).padStart(6, "0")}`;
    },
    transition: (number, from, to, patch) => mutate(number, from, to, patch),
    update: (number, patch) => mutate(number, null, null, patch),
    markEvent: (eventId) => p.marker("payment_event", eventId),
  };
}
