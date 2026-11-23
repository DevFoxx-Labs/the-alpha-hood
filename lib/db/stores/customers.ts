import { randomToken } from "@/lib/auth/secrets";
import type { Address, AddressInput } from "@/lib/checkout/address";
import { type Customer, type CustomerStore, MAX_ADDRESSES } from "@/lib/customers/store";
import { isMongoDuplicate, type MongoConn } from "../mongo";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx, toBool, toIso } from "../sql";

/**
 * Customers on SQL / MongoDB. Same behaviour as the memory store (contract-tested):
 * - one customer per verified phone (UNIQUE), find-or-create is race-safe (insert, on duplicate read back);
 * - address cap enforced inside a transaction that locks the customer row;
 * - counters are atomic updates; coupon usage is updated under the row lock;
 * - erasure (DPDP) blanks contact data and addresses; the phone is freed for a new sign-up.
 */
const MAX_SEARCH = 100;
const newCustomer = (phone: string, now: Date): Customer => ({
  id: `cus_${randomToken(12)}`,
  phone,
  name: null,
  email: null,
  createdAt: now.toISOString(),
  addresses: [],
  orderCount: 0,
  couponUses: {},
  codBlocked: false,
  rtoCount: 0,
});
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── SQL (MySQL + PostgreSQL) ──────────────────────────────────────────────────────────────────────

type CustomerRow = { id: string; phone: string; name: string | null; email: string | null; created_at: Date; order_count: number; coupon_uses: unknown; cod_blocked: boolean | number; rto_count: number };
type AddressRow = Address & { customer_id: string; position: number };

function toAddress(r: AddressRow): Address {
  return { id: r.id, name: r.name, phone: r.phone, pincode: r.pincode, line1: r.line1, line2: r.line2, landmark: r.landmark, city: r.city, state: r.state as Address["state"], type: r.type as Address["type"] };
}

export function createSqlCustomerStore(db: SqlDb): CustomerStore {
  const hydrate = async (rows: CustomerRow[], q: SqlDb = db): Promise<Customer[]> => {
    if (rows.length === 0) return [];
    const addresses = (await q
      .selectFrom("customer_addresses")
      .selectAll()
      .where("customer_id", "in", rows.map((r) => r.id))
      .orderBy("position")
      .execute()) as AddressRow[];
    return rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      name: r.name,
      email: r.email,
      createdAt: toIso(r.created_at),
      addresses: addresses.filter((a) => a.customer_id === r.id).map(toAddress),
      orderCount: Number(r.order_count),
      couponUses: fromJson<Record<string, number>>(r.coupon_uses, {}),
      codBlocked: toBool(r.cod_blocked),
      rtoCount: Number(r.rto_count),
    }));
  };
  const one = async (where: "id" | "phone", value: string, q: SqlDb = db) => {
    const row = await q.selectFrom("customers").selectAll().where(where, "=", value).executeTakeFirst();
    return row ? (await hydrate([row as CustomerRow], q))[0] : null;
  };
  const set = async (id: string, patch: Record<string, unknown>) => {
    await db.updateTable("customers").set(patch).where("id", "=", id).execute();
  };

  return {
    async findOrCreateByPhone(phone, now = new Date()) {
      const existing = await one("phone", phone);
      if (existing) return { customer: existing, created: false };
      const c = newCustomer(phone, now);
      try {
        await db
          .insertInto("customers")
          .values({ id: c.id, phone, name: null, email: null, created_at: now, order_count: 0, coupon_uses: "{}", cod_blocked: false, rto_count: 0, erased_at: null })
          .execute();
        return { customer: c, created: true };
      } catch (e) {
        // Two sign-ins for the same phone at once: the UNIQUE index lets exactly one create it.
        if (!isUniqueViolation(e)) throw e;
        return { customer: (await one("phone", phone))!, created: false };
      }
    },
    get: (id) => one("id", id),
    findByPhone: (phone) => one("phone", phone),
    setEmail: (id, email) => set(id, { email }),
    setName: (id, name) => set(id, { name }),
    async addAddress(id, address: AddressInput) {
      return sqlTx(db, async (trx) => {
        const owner = await trx.selectFrom("customers").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
        if (!owner) throw new Error("Customer not found");
        const { n } = (await trx.selectFrom("customer_addresses").select((eb) => eb.fn.countAll<number>().as("n")).where("customer_id", "=", id).executeTakeFirstOrThrow()) as { n: number | string };
        if (Number(n) >= MAX_ADDRESSES) throw new Error("Too many addresses");
        const max = (await trx.selectFrom("customer_addresses").select((eb) => eb.fn.max("position").as("p")).where("customer_id", "=", id).executeTakeFirst()) as { p: number | null } | undefined;
        const saved: Address = { ...address, id: `adr_${randomToken(9)}` };
        await trx
          .insertInto("customer_addresses")
          .values({ ...saved, customer_id: id, position: Number(max?.p ?? -1) + 1 })
          .execute();
        return saved;
      });
    },
    async removeAddress(id, addressId) {
      const r = await db.deleteFrom("customer_addresses").where("id", "=", addressId).where("customer_id", "=", id).executeTakeFirst();
      return Number(r.numDeletedRows) > 0;
    },
    async erase(id, now = new Date()) {
      await sqlTx(db, async (trx) => {
        await trx.deleteFrom("customer_addresses").where("customer_id", "=", id).execute();
        await trx.updateTable("customers").set({ phone: `erased:${id}`, name: null, email: null, erased_at: now }).where("id", "=", id).execute();
      });
    },
    async recordOrder(id, couponCode) {
      await sqlTx(db, async (trx) => {
        const row = await trx.selectFrom("customers").select(["coupon_uses"]).where("id", "=", id).forUpdate().executeTakeFirst();
        if (!row) return;
        const uses = fromJson<Record<string, number>>(row.coupon_uses, {});
        if (couponCode) uses[couponCode] = (uses[couponCode] ?? 0) + 1;
        await trx
          .updateTable("customers")
          .set((eb) => ({ order_count: eb("order_count", "+", 1), coupon_uses: JSON.stringify(uses) }))
          .where("id", "=", id)
          .execute();
      });
    },
    async search(query, limit = 50) {
      const q = query.trim().toLowerCase().slice(0, 80);
      const digits = q.replace(/\D/g, "");
      let sel = db.selectFrom("customers").selectAll().where("erased_at", "is", null);
      if (q) {
        const like = `%${likeEscape(q)}%`;
        sel = sel.where((eb) =>
          eb.or([
            ...(digits.length >= 4 ? [eb("phone", "like", `%${likeEscape(digits)}%`)] : []),
            eb(eb.fn("lower", ["name"]), "like", like),
            eb(eb.fn("lower", ["email"]), "like", like),
            eb("id", "=", q),
          ]),
        );
      }
      const rows = await sel.orderBy("created_at", "desc").limit(Math.min(limit, MAX_SEARCH)).execute();
      return hydrate(rows as CustomerRow[]);
    },
    setCodBlocked: (id, blocked) => set(id, { cod_blocked: blocked }),
    async recordRto(id) {
      await db.updateTable("customers").set((eb) => ({ rto_count: eb("rto_count", "+", 1) })).where("id", "=", id).execute();
    },
  };
}

// ── MongoDB (addresses embedded in the customer document) ─────────────────────────────────────────

type CustomerDoc = Omit<Customer, "id" | "createdAt"> & { _id: string; created_at: Date; erased_at: Date | null };

const fromDoc = (d: CustomerDoc): Customer => ({
  id: d._id,
  phone: d.phone,
  name: d.name,
  email: d.email,
  createdAt: toIso(d.created_at),
  addresses: d.addresses ?? [],
  orderCount: d.orderCount ?? 0,
  couponUses: d.couponUses ?? {},
  codBlocked: !!d.codBlocked,
  rtoCount: d.rtoCount ?? 0,
});

export function createMongoCustomerStore(conn: Promise<MongoConn>): CustomerStore {
  const col = async () => (await conn).db.collection<CustomerDoc>("customers");
  const set = async (id: string, patch: Partial<CustomerDoc>) => {
    await (await col()).updateOne({ _id: id }, { $set: patch });
  };
  return {
    async findOrCreateByPhone(phone, now = new Date()) {
      const c = await col();
      const existing = await c.findOne({ phone });
      if (existing) return { customer: fromDoc(existing), created: false };
      const fresh = newCustomer(phone, now);
      try {
        await c.insertOne({
          _id: fresh.id,
          phone,
          name: null,
          email: null,
          addresses: [],
          orderCount: 0,
          couponUses: {},
          codBlocked: false,
          rtoCount: 0,
          created_at: now,
          erased_at: null,
        });
        return { customer: fresh, created: true };
      } catch (e) {
        if (!isMongoDuplicate(e)) throw e;
        return { customer: fromDoc((await c.findOne({ phone }))!), created: false };
      }
    },
    async get(id) {
      const d = await (await col()).findOne({ _id: id });
      return d ? fromDoc(d) : null;
    },
    async findByPhone(phone) {
      const d = await (await col()).findOne({ phone });
      return d ? fromDoc(d) : null;
    },
    setEmail: (id, email) => set(id, { email }),
    setName: (id, name) => set(id, { name }),
    async addAddress(id, address) {
      const saved: Address = { ...address, id: `adr_${randomToken(9)}` };
      // Atomic single-document update: push only while under the cap (no lost update, no transaction needed).
      const r = await (await col()).updateOne({ _id: id, [`addresses.${MAX_ADDRESSES - 1}`]: { $exists: false } }, { $push: { addresses: saved } });
      if (r.matchedCount === 0) {
        const exists = await (await col()).countDocuments({ _id: id });
        throw new Error(exists ? "Too many addresses" : "Customer not found");
      }
      return saved;
    },
    async removeAddress(id, addressId) {
      const r = await (await col()).updateOne({ _id: id, "addresses.id": addressId }, { $pull: { addresses: { id: addressId } } });
      return r.modifiedCount > 0;
    },
    async erase(id, now = new Date()) {
      await set(id, { phone: `erased:${id}`, name: null, email: null, addresses: [], erased_at: now });
    },
    async recordOrder(id, couponCode) {
      await (await col()).updateOne({ _id: id }, { $inc: { orderCount: 1, ...(couponCode ? { [`couponUses.${couponCode}`]: 1 } : {}) } });
    },
    async search(query, limit = 50) {
      const q = query.trim().toLowerCase().slice(0, 80);
      const digits = q.replace(/\D/g, "");
      const rx = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const filter = q
        ? { erased_at: null, $or: [...(digits.length >= 4 ? [{ phone: rx(digits) }] : []), { name: rx(q) }, { email: rx(q) }, { _id: q }] }
        : { erased_at: null };
      return (await (await col()).find(filter).sort({ created_at: -1 }).limit(Math.min(limit, MAX_SEARCH)).toArray()).map(fromDoc);
    },
    setCodBlocked: (id, blocked) => set(id, { codBlocked: blocked }),
    async recordRto(id) {
      await (await col()).updateOne({ _id: id }, { $inc: { rtoCount: 1 } });
    },
  };
}

