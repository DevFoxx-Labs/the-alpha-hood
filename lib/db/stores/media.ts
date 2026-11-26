import { Binary } from "mongodb";
import { MEDIA_ID_RE, type MediaItem, type MediaStore } from "@/lib/catalog/media";
import type { PhotoType } from "@/lib/returns/photos";
import type { MongoConn } from "../mongo";
import { type SqlDb, toIso } from "../sql";

/** Product photos on the own backend (phase 6). Immutable rows: written once, never updated (removed only for review photos). */
export function createSqlMediaStore(db: SqlDb): MediaStore {
  return {
    async save(m) {
      await db
        .insertInto("product_media")
        .values({ id: m.id, type: m.type, width: m.width, height: m.height, bytes: Buffer.from(m.bytes), created_at: new Date(m.createdAt), created_by: m.createdBy, storage_key: m.storageKey ?? null })
        .execute();
    },
    async get(id) {
      if (!MEDIA_ID_RE.test(id)) return null;
      const r = await db.selectFrom("product_media").selectAll().where("id", "=", id).executeTakeFirst();
      return r
        ? ({ id: r.id, type: r.type as PhotoType, width: Number(r.width), height: Number(r.height), bytes: new Uint8Array(r.bytes), createdAt: toIso(r.created_at), createdBy: r.created_by, storageKey: r.storage_key ?? null } satisfies MediaItem)
        : null;
    },
    async existing(ids) {
      const valid = ids.filter((id) => MEDIA_ID_RE.test(id));
      if (!valid.length) return new Set();
      return new Set((await db.selectFrom("product_media").select("id").where("id", "in", valid).execute()).map((r) => r.id));
    },
    async remove(id) {
      if (MEDIA_ID_RE.test(id)) await db.deleteFrom("product_media").where("id", "=", id).execute();
    },
  };
}

export function createMongoMediaStore(conn: Promise<MongoConn>): MediaStore {
  type Doc = Omit<MediaItem, "id" | "bytes"> & { _id: string; bytes: Binary };
  const col = async () => (await conn).db.collection<Doc>("product_media");
  return {
    async save(m) {
      const { id, bytes, ...rest } = m;
      await (await col()).insertOne({ ...rest, _id: id, bytes: new Binary(bytes) });
    },
    async get(id) {
      if (!MEDIA_ID_RE.test(id)) return null;
      const d = await (await col()).findOne({ _id: id });
      if (!d) return null;
      const { _id, bytes, ...rest } = d;
      return { ...rest, id: _id, bytes: new Uint8Array(bytes.buffer) };
    },
    async existing(ids) {
      const valid = ids.filter((id) => MEDIA_ID_RE.test(id));
      if (!valid.length) return new Set();
      return new Set((await (await col()).find({ _id: { $in: valid } }, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
    },
    async remove(id) {
      if (MEDIA_ID_RE.test(id)) await (await col()).deleteOne({ _id: id });
    },
  };
}
