import type { SocialIdentity, SocialIdentityStore, SocialProvider } from "@/lib/auth/social-identities";
import type { MongoConn } from "../mongo";
import { isUniqueViolation, type SqlDb, toIso } from "../sql";
import { isMongoDuplicate } from "../mongo";

/** Social sign-in links on the own backend. The primary key (provider, subject) makes "one account, one customer" a rule of the database. */
export function createSqlSocialIdentityStore(db: SqlDb): SocialIdentityStore {
  const view = (r: { provider: string; subject: string; customer_id: string; email: string | null; created_at: Date | string }): SocialIdentity => ({
    provider: r.provider as SocialProvider,
    subject: r.subject,
    customerId: r.customer_id,
    email: r.email,
    createdAt: toIso(r.created_at),
  });
  return {
    async find(provider, subject) {
      const r = await db.selectFrom("customer_identities").selectAll().where("provider", "=", provider).where("subject", "=", subject).executeTakeFirst();
      return r ? view(r) : null;
    },
    async link(i) {
      try {
        await db.insertInto("customer_identities").values({ provider: i.provider, subject: i.subject, customer_id: i.customerId, email: i.email, created_at: new Date(i.createdAt) }).execute();
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    async listFor(customerId) {
      return (await db.selectFrom("customer_identities").selectAll().where("customer_id", "=", customerId).orderBy("provider").execute()).map(view);
    },
    async unlink(customerId, provider) {
      const r = await db.deleteFrom("customer_identities").where("customer_id", "=", customerId).where("provider", "=", provider).executeTakeFirst();
      return Number(r.numDeletedRows) > 0;
    },
    async eraseCustomer(customerId) {
      await db.deleteFrom("customer_identities").where("customer_id", "=", customerId).execute();
    },
  };
}

export function createMongoSocialIdentityStore(conn: Promise<MongoConn>): SocialIdentityStore {
  type Doc = { _id: string; provider: SocialProvider; subject: string; customerId: string; email: string | null; createdAt: Date };
  const col = async () => (await conn).db.collection<Doc>("customer_identities");
  const view = (d: Doc): SocialIdentity => ({ provider: d.provider, subject: d.subject, customerId: d.customerId, email: d.email, createdAt: d.createdAt.toISOString() });
  return {
    async find(provider, subject) {
      const d = await (await col()).findOne({ _id: `${provider}|${subject}` });
      return d ? view(d) : null;
    },
    async link(i) {
      try {
        await (await col()).insertOne({ _id: `${i.provider}|${i.subject}`, provider: i.provider, subject: i.subject, customerId: i.customerId, email: i.email, createdAt: new Date(i.createdAt) });
        return true;
      } catch (e) {
        if (isMongoDuplicate(e)) return false;
        throw e;
      }
    },
    async listFor(customerId) {
      return (await (await col()).find({ customerId }).sort({ provider: 1 }).toArray()).map(view);
    },
    async unlink(customerId, provider) {
      return (await (await col()).deleteMany({ customerId, provider })).deletedCount > 0;
    },
    async eraseCustomer(customerId) {
      await (await col()).deleteMany({ customerId });
    },
  };
}
