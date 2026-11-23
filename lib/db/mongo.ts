import { type ClientSession, type Db, MongoClient } from "mongodb";
import { databaseName, type DbConfig } from "./config.ts";

/**
 * MongoDB connection. Multi-document writes need transactions, which need a replica set (a single-node `rs0` is
 * fine locally — see scripts/mongo-rs-init.mjs). One client per URL, cached on globalThis for dev hot-reload.
 */
export interface MongoConn {
  client: MongoClient;
  db: Db;
}
type Cache = Map<string, Promise<MongoConn>>;
const g = globalThis as unknown as { __alpha_hood_mongo?: Cache };
const cache = (): Cache => (g.__alpha_hood_mongo ??= new Map());

export function getMongo(cfg: DbConfig): Promise<MongoConn> {
  if (cfg.driver !== "mongodb") throw new Error("getMongo called for a SQL config");
  const hit = cache().get(cfg.url);
  if (hit) return hit;
  const p = (async () => {
    const client = new MongoClient(cfg.url, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 10, retryWrites: true });
    await client.connect();
    return { client, db: client.db(databaseName(cfg)) };
  })();
  p.catch(() => cache().delete(cfg.url)); // a failed connect can be retried on the next call
  cache().set(cfg.url, p);
  return p;
}

export async function closeMongo(cfg: DbConfig) {
  const p = cache().get(cfg.url);
  if (!p) return;
  cache().delete(cfg.url);
  await (await p).client.close();
}

/**
 * ACID unit of work on MongoDB: majority read/write concern; the driver retries transient transaction errors.
 * Pass `session` to every operation inside `fn`. No external calls inside.
 */
export async function mongoTx<T>(conn: MongoConn, fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = conn.client.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: "majority" }, writeConcern: { w: "majority" }, readPreference: "primary" },
    );
    return result;
  } finally {
    await session.endSession();
  }
}

export function isMongoDuplicate(e: unknown): boolean {
  return (e as { code?: number }).code === 11000;
}
