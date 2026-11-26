import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryMediaStore, type MediaItem } from "@/lib/catalog/media";
import { createMemoryProviderStore } from "@/lib/providers/store";
import { type Fetcher, localBackend, OBJECT_KEY_RE, probeBackend, r2Backend, s3Backend, StorageError } from "./backends";
import { withObjectStorage } from "./media";
import { setStorageRuntime, STORAGE_IDS, type StorageDoc } from "./runtime";
import { activateStorage, saveBackend, storagePayload, testBackend } from "./service";
import { signRequest } from "./sigv4";

// Fake keys, built at runtime: a literal in AWS's key format would be (rightly) blocked by GitHub secret scanning.
const fakeAwsKeyId = (tail: string) => ["AK", "IA", tail.padEnd(16, "0")].join("");
const S3 = { accessKeyId: fakeAwsKeyId("TESTONLY"), secretAccessKey: ["test", "only", "+/"].join("").repeat(4), region: "ap-south-1", bucket: "alpha-hood-media" };
const R2 = { accountId: "0123456789abcdef0123456789abcdef", accessKeyId: "fedcba9876543210fedcba9876543210", secretAccessKey: "a".repeat(64), bucket: "alpha-hood-media" };
const BY = "stf_owner";

/** An in-memory S3: answers PUT / GET / DELETE like the real API and records requests. */
function fakeBucket(opts: { status?: number; body?: string } = {}) {
  const objects = new Map<string, Uint8Array>();
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ method: String(init.method), url, headers });
    if (opts.status) return new Response(opts.body ?? "", { status: opts.status });
    const key = new URL(url).pathname;
    if (init.method === "PUT") objects.set(key, new Uint8Array(init.body as Buffer));
    if (init.method === "GET") return objects.has(key) ? new Response(Buffer.from(objects.get(key)!)) : new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    if (init.method === "DELETE") objects.delete(key);
    return new Response(null, { status: init.method === "DELETE" ? 204 : 200 });
  };
  return { objects, calls, fetcher };
}

const tmp: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "ah-storage-"));
  tmp.push(d);
  return d;
};
afterEach(() => {
  setStorageRuntime(null, {});
  for (const d of tmp.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("SigV4", () => {
  it("matches the GET Object example in the Amazon S3 Signature Version 4 documentation", () => {
    const h = signRequest({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      headers: { range: "bytes=0-9" },
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(h["x-amz-content-sha256"]).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(h.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });
});

describe("backends", () => {
  it("S3 and R2 talk to fixed hosts only, signed, no redirects; keys never in the URL", async () => {
    const s3 = fakeBucket();
    await probeBackend(s3Backend(S3, s3.fetcher));
    expect(s3.calls.map((c) => [c.method, new URL(c.url).origin])).toEqual([
      ["PUT", "https://alpha-hood-media.s3.ap-south-1.amazonaws.com"],
      ["GET", "https://alpha-hood-media.s3.ap-south-1.amazonaws.com"],
      ["DELETE", "https://alpha-hood-media.s3.ap-south-1.amazonaws.com"],
    ]);
    expect(s3.calls.every((c) => c.headers.authorization.startsWith(`AWS4-HMAC-SHA256 Credential=${S3.accessKeyId}/`) && !c.url.includes(S3.secretAccessKey))).toBe(true);
    const r2 = fakeBucket();
    expect((await probeBackend(r2Backend(R2, r2.fetcher))).ok).toBe(true);
    expect(new URL(r2.calls[0].url).host).toBe(`${R2.accountId}.r2.cloudflarestorage.com`);
    expect(new URL(r2.calls[0].url).pathname).toMatch(/^\/alpha-hood-media\/\.probe\/[a-f0-9]{24}\.txt$/);
    expect(r2.calls[0].headers.authorization).toContain("/auto/s3/aws4_request");
  });

  it("identifiers that could change the host are refused before any request", () => {
    for (const bad of [{ bucket: "evil.example.com/x" }, { bucket: "a" }, { region: "x.evil.com" }, { accessKeyId: "AKIA" }]) {
      expect(() => s3Backend({ ...S3, ...bad }), JSON.stringify(bad)).toThrow(StorageError);
    }
    expect(() => r2Backend({ ...R2, accountId: "evil.example.com#" })).toThrow(StorageError);
  });

  it("errors are classified and scrubbed of the keys", async () => {
    const denied = fakeBucket({ status: 403, body: `<Error><Code>AccessDenied</Code><Message>Key ${S3.accessKeyId} denied</Message></Error>` });
    const e = await s3Backend(S3, denied.fetcher).put("media/med_0123456789abcdef0123456789abcdef.jpg", new Uint8Array([1]), "image/jpeg").catch((x) => x);
    expect(e).toMatchObject({ code: "rejected" });
    expect(e.message).toContain("AccessDenied");
    expect(e.message).not.toContain(S3.accessKeyId);
    const down: Fetcher = async () => Promise.reject(new Error("ECONNRESET"));
    expect((await probeBackend(s3Backend(S3, down))).ok).toBe(false);
  });

  it("local folder: server-chosen keys only, no path traversal, never overwrites", async () => {
    const dir = tempDir();
    const local = localBackend(dir);
    const key = "media/med_0123456789abcdef0123456789abcdef.png";
    await local.put(key, new Uint8Array([1, 2, 3]), "image/png");
    expect([...(await local.get(key))]).toEqual([1, 2, 3]);
    await expect(local.put(key, new Uint8Array([9]), "image/png")).rejects.toBeInstanceOf(StorageError);
    for (const bad of ["../../etc/passwd", "media/../../x.jpg", "media/med_x.php", "/abs.jpg", "media\\..\\x.jpg"]) {
      expect(OBJECT_KEY_RE.test(bad), bad).toBe(false);
      await expect(local.put(bad, new Uint8Array([1]), "image/png"), bad).rejects.toMatchObject({ code: "invalid" });
    }
    await expect(local.get("media/med_ffffffffffffffffffffffffffffffff.jpg")).rejects.toMatchObject({ code: "not_found" });
    expect((await probeBackend(local)).ok).toBe(true);
    expect(readdirSync(join(dir, ".probe"))).toEqual([]); // the probe cleans up
  });
});

describe("photos on the active storage", () => {
  const item = (n: string): MediaItem => ({ id: `med_${n.padStart(32, "0")}`, type: "image/jpeg", width: 800, height: 1000, bytes: new Uint8Array([0xff, 0xd8, Number(n)]), createdAt: "2026-11-29T00:00:00.000Z", createdBy: BY });

  it("with no storage active the database keeps the bytes (unchanged behaviour)", async () => {
    const inner = createMemoryMediaStore();
    const media = withObjectStorage(inner);
    await media.save(item("1"));
    expect((await inner.get(item("1").id))!.bytes.length).toBe(3);
    expect((await inner.get(item("1").id))!.storageKey ?? null).toBeNull();
  });

  it("switching storage: new photos go to the active one, old ones are still read from where they were stored", async () => {
    const inner = createMemoryMediaStore();
    const media = withObjectStorage(inner);
    const bucket = fakeBucket();
    const local = localBackend(tempDir());
    const s3 = s3Backend(S3, bucket.fetcher);
    await media.save(item("1")); // database
    setStorageRuntime("local", { local, s3 });
    await media.save(item("2")); // server folder
    setStorageRuntime("s3", { local, s3 });
    await media.save(item("3")); // S3
    expect((await inner.get(item("2").id))!).toMatchObject({ storageKey: `local:media/${item("2").id}.jpg`, bytes: new Uint8Array() });
    expect((await inner.get(item("3").id))!.storageKey).toBe(`s3:media/${item("3").id}.jpg`);
    expect([...bucket.objects.keys()]).toEqual([`/media/${item("3").id}.jpg`]);
    for (const n of ["1", "2", "3"]) expect([...(await media.get(item(n).id))!.bytes]).toEqual([...item(n).bytes]);
    // The backend that holds a photo is no longer configured → a clear error, not wrong bytes.
    setStorageRuntime("s3", { s3 });
    await expect(media.get(item("2").id)).rejects.toMatchObject({ code: "unavailable" });
    // A tampered storage key is refused.
    await inner.save({ ...item("4"), bytes: new Uint8Array(), storageKey: "s3:../../secret" });
    await expect(media.get(item("4").id)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("storage settings service", () => {
  const env = (dir: string) => ({ NODE_ENV: "test", STORAGE_LOCAL_DIR: dir });

  it("keys are write-only; validation; a backend goes active only after a passed test", async () => {
    const store = createMemoryProviderStore();
    const bucket = fakeBucket();
    const deps = { fetcher: bucket.fetcher, env: env(tempDir()) };
    const saved = await saveBackend(store, "s3", S3, BY, deps);
    expect(JSON.stringify(saved)).not.toContain(S3.secretAccessKey);
    expect(JSON.stringify(saved)).not.toContain(S3.accessKeyId);
    expect(saved.payload.backends.find((b) => b.kind === "s3")).toMatchObject({ configured: true, verified: false, keyHint: "AKIA••••00", secretSet: true, fields: { region: "ap-south-1", bucket: "alpha-hood-media" } });
    await expect(saveBackend(store, "s3", { ...S3, bucket: "Bad.Bucket" }, BY, deps)).rejects.toMatchObject({ fields: { bucket: expect.any(String) } });
    await expect(saveBackend(store, "s3", { ...S3, endpoint: "http://169.254.169.254" }, BY, deps)).rejects.toThrow(/Unknown field/);
    await expect(saveBackend(store, "gcs", S3, BY, deps)).rejects.toMatchObject({ status: 404 });
    await expect(saveBackend(store, "local", {}, BY, deps)).rejects.toMatchObject({ status: 422 });

    await expect(activateStorage(store, "s3", BY, deps)).rejects.toMatchObject({ code: "not_verified" });
    expect((await testBackend(store, "s3", BY, deps)).ok).toBe(true);
    const on = await activateStorage(store, "s3", BY, deps);
    expect(on).toMatchObject({ liveChanged: true, payload: { active: "s3" } });
    await expect(activateStorage(store, "ftp", BY, deps)).rejects.toMatchObject({ status: 422 });

    // Bucket is locked once used; keys can rotate — only with a passing test while active.
    await expect(saveBackend(store, "s3", { ...S3, bucket: "another-bucket" }, BY, deps)).rejects.toMatchObject({ fields: { bucket: expect.stringMatching(/Locked/) } });
    const failing = { ...deps, fetcher: fakeBucket({ status: 403, body: "<Error><Code>InvalidAccessKeyId</Code></Error>" }).fetcher };
    await expect(saveBackend(store, "s3", { ...S3, accessKeyId: fakeAwsKeyId("ROTATED") }, BY, failing)).rejects.toMatchObject({ code: "test_failed" });
    expect((await store.get<StorageDoc>("storage", STORAGE_IDS.s3))!.doc!.s3!.accessKeyId).toBe(S3.accessKeyId);
    const rotated = await saveBackend(store, "s3", { ...S3, accessKeyId: fakeAwsKeyId("ROTATED"), secretAccessKey: "" }, BY, deps);
    expect(rotated.payload.backends.find((b) => b.kind === "s3")).toMatchObject({ keyHint: "AKIA••••00", verified: true, active: true });

    // Local: test, then make it active; back to the database.
    expect((await testBackend(store, "local", BY, deps)).ok).toBe(true);
    expect((await activateStorage(store, "local", BY, deps)).payload.active).toBe("local");
    expect((await storagePayload(store, deps.env)).backends.filter((b) => b.active).map((b) => b.kind)).toEqual(["local"]);
    expect((await activateStorage(store, "database", BY, deps)).payload.active).toBe("database");
  });
});
