import { randomToken } from "@/lib/auth/secrets";
import type { Address, AddressInput } from "@/lib/checkout/address";
import { type Customer, type CustomerStore, EmailInUseError, MAX_ADDRESSES, newCustomerRecord, NO_PHONE_PREFIX } from "@/lib/customers/store";
import { isMongoDuplicate, type MongoConn } from "../mongo";
import { fromJson, isUniqueViolation, type SqlDb, sqlTx, toBool, toIso } from "../sql";

/**
 * Customers on SQL / MongoDB. Same behaviour as the memory store (contract-tested):
 * - one customer per verified phone and per verified sign-in email (UNIQUE); find-or-create is race-safe
 *   (insert, on duplicate read back);
 * - an account without a mobile holds `none:<id>` in the NOT NULL UNIQUE phone column (read as null);
 * - address cap enforced inside a transaction that locks the customer row;
 * - counters are atomic updates; coupon usage is updated under the row lock;
 * - erasure (DPDP) blanks contact data, sign-in email and addresses; phone and email are freed for a new sign-up.
 */
const MAX_SEARCH = 100;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const phoneOut = (stored: string): string | null => (stored.startsWith(NO_PHONE_PREFIX) ? null : stored);
const phoneIn = (c: Customer) => c.phone ?? `${NO_PHONE_PREFIX}${c.id}`;

// ── SQL (MySQL + PostgreSQL) ──────────────────────────────────────────────────────────────────────

type CustomerRow = { id: string; phone: string; name: string | null; email: string | null; email_verified_at: Date | null; login_email?: string | null; created_at: Date; order_count: number; coupon_uses: unknown; cod_blocked: boolean | number; rto_count: number };
type AddressRow = Address & { customer_id: string; position: number };

type AddressDbRow = Omit<AddressRow, "location" | "isDefault" | "forSomeoneElse" | "alternatePhone" | "instructions"> & {
  alt_phone?: string | null;
  instructions?: string | null;
  for_other?: boolean | number | null;
  is_default?: boolean | number | null;
  lat_e6?: number | null;
  lng_e6?: number | null;
};

function toAddress(r: AddressDbRow): Address {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    pincode: r.pincode,
    line1: r.line1,
    line2: r.line2,
    landmark: r.landmark,
    city: r.city,
    state: r.state as Address["state"],
    type: r.type as Address["type"],
    alternatePhone: r.alt_phone ?? "",
    instructions: r.instructions ?? "",
    forSomeoneElse: toBool(r.for_other ?? false),
    isDefault: toBool(r.is_default ?? false),
    location: r.lat_e6 === null || r.lat_e6 === undefined || r.lng_e6 === null || r.lng_e6 === undefined ? null : { lat: Number(r.lat_e6) / 1e6, lng: Number(r.lng_e6) / 1e6 },
  };
}

/** Address fields → columns (the pin as integer micro-degrees). */
function addressColumns(a: Omit<Address, "id">) {
  return {
    name: a.name,
    phone: a.phone,
    pincode: a.pincode,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    type: a.type,
    alt_phone: a.alternatePhone ?? "",
    instructions: a.instructions ?? "",
    for_other: !!a.forSomeoneElse,
    is_default: !!a.isDefault,
    lat_e6: a.location ? Math.round(a.location.lat * 1e6) : null,
    lng_e6: a.location ? Math.round(a.location.lng * 1e6) : null,
  };
}

export function createSqlCustomerStore(db: SqlDb): CustomerStore {
  const hydrate = async (rows: CustomerRow[], q: SqlDb = db): Promise<Customer[]> => {
    if (rows.length === 0) return [];
    const addresses = (await q
      .selectFrom("customer_addresses")
      .selectAll()
      .where("customer_id", "in", rows.map((r) => r.id))
      .orderBy("position")
      .execute()) as unknown as AddressDbRow[];
    return rows.map((r) => ({
      id: r.id,
      phone: phoneOut(r.phone),
      name: r.name,
      email: r.email,
      emailVerified: !!r.email && (!!r.email_verified_at || r.email === r.login_email),
      loginEmail: r.login_email ?? null,
      createdAt: toIso(r.created_at),
      addresses: addresses.filter((a) => a.customer_id === r.id).map(toAddress),
      orderCount: Number(r.order_count),
      couponUses: fromJson<Record<string, number>>(r.coupon_uses, {}),
      codBlocked: toBool(r.cod_blocked),
      rtoCount: Number(r.rto_count),
    }));
  };
  const one = async (where: "id" | "phone" | "login_email", value: string, q: SqlDb = db) => {
    const row = await q.selectFrom("customers").selectAll().where(where, "=", value).executeTakeFirst();
    return row ? (await hydrate([row as CustomerRow], q))[0] : null;
  };
  const set = async (id: string, patch: Record<string, unknown>) => {
    await db.updateTable("customers").set(patch).where("id", "=", id).execute();
  };
  const insert = async (c: Customer, now: Date) => {
    await db
      .insertInto("customers")
      .values({
        id: c.id,
        phone: phoneIn(c),
        name: null,
        email: c.email,
        email_verified_at: c.loginEmail ? now : null,
        login_email: c.loginEmail,
        created_at: now,
        order_count: 0,
        coupon_uses: "{}",
        cod_blocked: false,
        rto_count: 0,
        erased_at: null,
      })
      .execute();
  };

  return {
    async findOrCreateByPhone(phone, now = new Date()) {
      const existing = await one("phone", phone);
      if (existing) return { customer: existing, created: false };
      const c = newCustomerRecord(phone, now);
      try {
        await insert(c, now);
        return { customer: c, created: true };
      } catch (e) {
        // Two sign-ins for the same phone at once: the UNIQUE index lets exactly one create it.
        if (!isUniqueViolation(e)) throw e;
        return { customer: (await one("phone", phone))!, created: false };
      }
    },
    async findOrCreateByEmail(email, now = new Date()) {
      const existing = await one("login_email", email);
      if (existing) return { customer: existing, created: false };
      const c = newCustomerRecord(null, now, email);
      try {
        await insert(c, now);
        return { customer: c, created: true };
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        return { customer: (await one("login_email", email))!, created: false };
      }
    },
    get: (id) => one("id", id),
    findByPhone: (phone) => one("phone", phone),
    findByLoginEmail: (email) => one("login_email", email),
    async attachPhone(id, phone) {
      try {
        // Conditional update: only an account that still holds its own "no phone" placeholder.
        const r = await db.updateTable("customers").set({ phone }).where("id", "=", id).where("phone", "=", `${NO_PHONE_PREFIX}${id}`).executeTakeFirst();
        return Number(r.numUpdatedRows) === 1;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async setEmail(id, email, verified = false) {
      if (email && verified) {
        try {
          await set(id, { email, email_verified_at: new Date(), login_email: email });
        } catch (e) {
          if (isUniqueViolation(e)) throw new EmailInUseError();
          throw e;
        }
        return;
      }
      // Unverified: the sign-in email stays until the new address is verified. Removing the email removes both.
      await set(id, email ? { email, email_verified_at: null } : { email: null, email_verified_at: null, login_email: null });
    },
    setName: (id, name) => set(id, { name }),
    async addAddress(id, address: AddressInput) {
      return sqlTx(db, async (trx) => {
        const owner = await trx.selectFrom("customers").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
        if (!owner) throw new Error("Customer not found");
        const { n } = (await trx.selectFrom("customer_addresses").select((eb) => eb.fn.countAll<number>().as("n")).where("customer_id", "=", id).executeTakeFirstOrThrow()) as { n: number | string };
        if (Number(n) >= MAX_ADDRESSES) throw new Error("Too many addresses");
        const max = (await trx.selectFrom("customer_addresses").select((eb) => eb.fn.max("position").as("p")).where("customer_id", "=", id).executeTakeFirst()) as { p: number | null } | undefined;
        // The first address is the default; a new default replaces the old one (under the customer row lock).
        const saved: Address = { ...address, id: `adr_${randomToken(9)}`, isDefault: !!address.isDefault || Number(n) === 0 };
        if (saved.isDefault) await trx.updateTable("customer_addresses").set({ is_default: false }).where("customer_id", "=", id).execute();
        await trx
          .insertInto("customer_addresses")
          .values({ id: saved.id, ...addressColumns(saved), customer_id: id, position: Number(max?.p ?? -1) + 1 })
          .execute();
        return saved;
      });
    },
    async removeAddress(id, addressId) {
      return sqlTx(db, async (trx) => {
        const owner = await trx.selectFrom("customers").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
        if (!owner) return false;
        const gone = await trx.selectFrom("customer_addresses").select(["is_default"]).where("id", "=", addressId).where("customer_id", "=", id).executeTakeFirst();
        if (!gone) return false;
        await trx.deleteFrom("customer_addresses").where("id", "=", addressId).where("customer_id", "=", id).execute();
        if (toBool(gone.is_default)) {
          const next = await trx.selectFrom("customer_addresses").select("id").where("customer_id", "=", id).orderBy("position").executeTakeFirst();
          if (next) await trx.updateTable("customer_addresses").set({ is_default: true }).where("id", "=", next.id).execute();
        }
        return true;
      });
    },
    async updateAddress(id, addressId, input) {
      return sqlTx(db, async (trx) => {
        const owner = await trx.selectFrom("customers").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
        if (!owner) return null;
        const row = await trx.selectFrom("customer_addresses").select(["is_default"]).where("id", "=", addressId).where("customer_id", "=", id).executeTakeFirst();
        if (!row) return null;
        const next: Address = { ...input, id: addressId, isDefault: !!input.isDefault || toBool(row.is_default) };
        if (next.isDefault) await trx.updateTable("customer_addresses").set({ is_default: false }).where("customer_id", "=", id).execute();
        await trx.updateTable("customer_addresses").set(addressColumns(next)).where("id", "=", addressId).where("customer_id", "=", id).execute();
        return next;
      });
    },
    async setDefaultAddress(id, addressId) {
      return sqlTx(db, async (trx) => {
        const owner = await trx.selectFrom("customers").select("id").where("id", "=", id).forUpdate().executeTakeFirst();
        if (!owner) return false;
        const row = await trx.selectFrom("customer_addresses").select("id").where("id", "=", addressId).where("customer_id", "=", id).executeTakeFirst();
        if (!row) return false;
        await trx.updateTable("customer_addresses").set({ is_default: false }).where("customer_id", "=", id).execute();
        await trx.updateTable("customer_addresses").set({ is_default: true }).where("id", "=", addressId).execute();
        return true;
      });
    },
    async erase(id, now = new Date()) {
      await sqlTx(db, async (trx) => {
        await trx.deleteFrom("customer_addresses").where("customer_id", "=", id).execute();
        await trx.updateTable("customers").set({ phone: `erased:${id}`, name: null, email: null, email_verified_at: null, login_email: null, erased_at: now }).where("id", "=", id).execute();
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
            ...(digits.length >= 4 ? [eb.and([eb("phone", "like", `%${likeEscape(digits)}%`), eb("phone", "not like", `${NO_PHONE_PREFIX}%`)])] : []),
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

type CustomerDoc = Omit<Customer, "id" | "createdAt" | "emailVerified" | "loginEmail" | "phone"> & { _id: string; phone: string; created_at: Date; erased_at: Date | null; emailVerifiedAt?: Date | null; login_email?: string | null };

const fromDoc = (d: CustomerDoc): Customer => ({
  id: d._id,
  phone: phoneOut(d.phone),
  name: d.name,
  email: d.email,
  emailVerified: !!d.email && (!!d.emailVerifiedAt || d.email === d.login_email),
  loginEmail: d.login_email ?? null,
  createdAt: toIso(d.created_at),
  addresses: d.addresses ?? [],
  orderCount: d.orderCount ?? 0,
  couponUses: d.couponUses ?? {},
  codBlocked: !!d.codBlocked,
  rtoCount: d.rtoCount ?? 0,
});

export function createMongoCustomerStore(conn: Promise<MongoConn>): CustomerStore {
  const col = async () => (await conn).db.collection<CustomerDoc>("customers");
  /** Compare-and-set on the embedded list: a concurrent change makes the write miss, and it is retried on fresh data. */
  async function rewriteAddresses<T>(id: string, change: (list: Address[]) => { list: Address[]; result: T } | null, missing: T): Promise<T> {
    const c = await col();
    for (let i = 0; i < 5; i++) {
      const d = await c.findOne({ _id: id }, { projection: { addresses: 1 } });
      if (!d) return missing;
      const list = d.addresses ?? [];
      const out = change(list);
      if (!out) return missing;
      const r = await c.updateOne({ _id: id, addresses: list }, { $set: { addresses: out.list } });
      if (r.modifiedCount === 1) return out.result;
    }
    throw new Error("Address book busy — try again");
  }
  const set = async (id: string, patch: Partial<CustomerDoc>) => {
    await (await col()).updateOne({ _id: id }, { $set: patch });
  };
  const insert = async (fresh: Customer, now: Date) => {
    await (await col()).insertOne({
      _id: fresh.id,
      phone: phoneIn(fresh),
      name: null,
      email: fresh.email,
      ...(fresh.loginEmail ? { login_email: fresh.loginEmail, emailVerifiedAt: now } : {}),
      addresses: [],
      orderCount: 0,
      couponUses: {},
      codBlocked: false,
      rtoCount: 0,
      created_at: now,
      erased_at: null,
    });
  };
  return {
    async findOrCreateByPhone(phone, now = new Date()) {
      const c = await col();
      const existing = await c.findOne({ phone });
      if (existing) return { customer: fromDoc(existing), created: false };
      const fresh = newCustomerRecord(phone, now);
      try {
        await insert(fresh, now);
        return { customer: fresh, created: true };
      } catch (e) {
        if (!isMongoDuplicate(e)) throw e;
        return { customer: fromDoc((await c.findOne({ phone }))!), created: false };
      }
    },
    async findOrCreateByEmail(email, now = new Date()) {
      const c = await col();
      const existing = await c.findOne({ login_email: email });
      if (existing) return { customer: fromDoc(existing), created: false };
      const fresh = newCustomerRecord(null, now, email);
      try {
        await insert(fresh, now);
        return { customer: fresh, created: true };
      } catch (e) {
        if (!isMongoDuplicate(e)) throw e;
        return { customer: fromDoc((await c.findOne({ login_email: email }))!), created: false };
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
    async findByLoginEmail(email) {
      const d = await (await col()).findOne({ login_email: email });
      return d ? fromDoc(d) : null;
    },
    async attachPhone(id, phone) {
      try {
        const r = await (await col()).updateOne({ _id: id, phone: `${NO_PHONE_PREFIX}${id}` }, { $set: { phone } });
        return r.modifiedCount === 1;
      } catch (e) {
        if (isMongoDuplicate(e)) return false;
        throw e;
      }
    },
    async setEmail(id, email, verified = false) {
      const c = await col();
      if (email && verified) {
        try {
          await c.updateOne({ _id: id }, { $set: { email, emailVerifiedAt: new Date(), login_email: email } });
        } catch (e) {
          if (isMongoDuplicate(e)) throw new EmailInUseError();
          throw e;
        }
        return;
      }
      if (email) await c.updateOne({ _id: id }, { $set: { email, emailVerifiedAt: null } });
      else await c.updateOne({ _id: id }, { $set: { email: null, emailVerifiedAt: null }, $unset: { login_email: "" } });
    },
    setName: (id, name) => set(id, { name }),
    async addAddress(id, address) {
      const c = await col();
      // Optimistic: read the list, write it back only if nobody changed it meanwhile (`addresses` matched as read).
      for (let i = 0; i < 5; i++) {
        const d = await c.findOne({ _id: id }, { projection: { addresses: 1 } });
        if (!d) throw new Error("Customer not found");
        const list = d.addresses ?? [];
        if (list.length >= MAX_ADDRESSES) throw new Error("Too many addresses");
        const saved: Address = { ...address, id: `adr_${randomToken(9)}`, isDefault: !!address.isDefault || list.length === 0 };
        const next = [...(saved.isDefault ? list.map((a) => ({ ...a, isDefault: false })) : list), saved];
        const r = await c.updateOne({ _id: id, addresses: list }, { $set: { addresses: next } });
        if (r.modifiedCount === 1) return saved;
      }
      throw new Error("Address book busy — try again");
    },
    async removeAddress(id, addressId) {
      return rewriteAddresses(id, (list) => {
        const gone = list.find((a) => a.id === addressId);
        if (!gone) return null;
        const rest = list.filter((a) => a.id !== addressId);
        if (gone.isDefault && rest[0]) rest[0] = { ...rest[0], isDefault: true };
        return { list: rest, result: true };
      }, false);
    },
    async updateAddress(id, addressId, input) {
      return rewriteAddresses(id, (list) => {
        const i = list.findIndex((a) => a.id === addressId);
        if (i < 0) return null;
        const next: Address = { ...input, id: addressId, isDefault: !!input.isDefault || !!list[i].isDefault };
        const out = next.isDefault ? list.map((a) => ({ ...a, isDefault: false })) : [...list];
        out[i] = next;
        return { list: out, result: next };
      }, null);
    },
    async setDefaultAddress(id, addressId) {
      return rewriteAddresses(id, (list) => (list.some((a) => a.id === addressId) ? { list: list.map((a) => ({ ...a, isDefault: a.id === addressId })), result: true } : null), false);
    },
    async erase(id, now = new Date()) {
      await (await col()).updateOne({ _id: id }, { $set: { phone: `erased:${id}`, name: null, email: null, emailVerifiedAt: null, addresses: [], erased_at: now }, $unset: { login_email: "" } });
    },
    async recordOrder(id, couponCode) {
      await (await col()).updateOne({ _id: id }, { $inc: { orderCount: 1, ...(couponCode ? { [`couponUses.${couponCode}`]: 1 } : {}) } });
    },
    async search(query, limit = 50) {
      const q = query.trim().toLowerCase().slice(0, 80);
      const digits = q.replace(/\D/g, "");
      const rx = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const filter = q
        ? { erased_at: null, $or: [...(digits.length >= 4 ? [{ $and: [{ phone: rx(digits) }, { phone: { $not: /^none:/ } }] }] : []), { name: rx(q) }, { email: rx(q) }, { _id: q }] }
        : { erased_at: null };
      return (await (await col()).find(filter).sort({ created_at: -1 }).limit(Math.min(limit, MAX_SEARCH)).toArray()).map(fromDoc);
    },
    setCodBlocked: (id, blocked) => set(id, { codBlocked: blocked }),
    async recordRto(id) {
      await (await col()).updateOne({ _id: id }, { $inc: { rtoCount: 1 } });
    },
  };
}

