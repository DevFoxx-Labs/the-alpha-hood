import type { MediaItem, MediaStore } from "@/lib/catalog/media";
import { type BackendKind, StorageError } from "./backends";
import { activeBackend, backendOf } from "./runtime";

/**
 * Product photos on the active storage (Admin → Storage). Wraps the database media store:
 * - save: with a storage backend active, the bytes go there first (`media/<id>.<ext>`), then the database row is
 *   written with no bytes and `storageKey = "<kind>:<key>"`. With none active, the row holds the bytes, as before.
 * - get: a row with a storageKey is read back from the backend that holds it — not the active one — so switching
 *   storage never breaks old photos as long as that backend stays configured.
 * The public URL (`/api/media/<id>`) and its caching do not change.
 */
const EXT = { "image/jpeg": "jpg", "image/png": "png" } as const;
const STORED_RE = /^(local|s3|r2):(media\/med_[a-f0-9]{32}\.(?:jpg|png))$/;

export function withObjectStorage(inner: MediaStore): MediaStore {
  return {
    async save(item) {
      const backend = activeBackend();
      if (!backend) return inner.save(item);
      const key = `media/${item.id}.${EXT[item.type]}`;
      await backend.put(key, item.bytes, item.type);
      await inner.save({ ...item, bytes: new Uint8Array(), storageKey: `${backend.kind}:${key}` });
    },
    async get(id) {
      const item = await inner.get(id);
      if (!item?.storageKey) return item;
      const m = STORED_RE.exec(item.storageKey);
      if (!m) throw new StorageError("invalid", "Unknown storage location.");
      const backend = backendOf(m[1] as BackendKind);
      if (!backend) throw new StorageError("unavailable", `The ${m[1]} storage that holds this photo is not configured.`);
      return { ...item, bytes: await backend.get(m[2]) } satisfies MediaItem;
    },
    existing: (ids) => inner.existing(ids),
    // The file on the backend that holds it first (so no row points at nothing), then the row.
    async remove(id) {
      const item = await inner.get(id);
      if (!item) return;
      const m = item.storageKey ? STORED_RE.exec(item.storageKey) : null;
      if (m) await backendOf(m[1] as BackendKind)?.delete(m[2]);
      await inner.remove(id);
    },
  };
}
