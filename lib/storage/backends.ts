import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { signRequest } from "./sigv4";

/**
 * Where uploaded files can live besides the database: a folder on this server, Amazon S3 or Cloudflare R2.
 *
 * - Hosts are fixed in code (`<bucket>.s3.<region>.amazonaws.com`, `<account>.r2.cloudflarestorage.com`); the admin
 *   only types identifiers that are checked against strict patterns, so no setting can make the server call an
 *   arbitrary address (no SSRF). Redirects are refused; every call has a timeout.
 * - Objects are PRIVATE: no public ACL, no public bucket needed. The store serves them through its own routes.
 * - Keys are chosen by the server (`media/<random id>.<ext>`); a key that doesn't match the pattern is refused, so
 *   the local folder can't be escaped (no path traversal) and nothing lands in a folder the web server executes.
 * - Errors are scrubbed of the access keys before anyone sees them.
 */
export type BackendKind = "local" | "s3" | "r2";
export const BACKEND_KINDS: readonly BackendKind[] = ["local", "s3", "r2"];

export const OBJECT_KEY_RE = /^(media\/med_[a-f0-9]{32}\.(jpg|png)|\.probe\/[a-f0-9]{24}\.txt)$/;

export class StorageError extends Error {
  constructor(
    public readonly code: "not_found" | "rejected" | "unavailable" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export interface ObjectBackend {
  readonly kind: BackendKind;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export const S3_PATTERNS = {
  accessKeyId: /^AKIA[A-Z0-9]{16}$/,
  secretAccessKey: /^[A-Za-z0-9/+]{40}$/,
  region: /^[a-z]{2}(-gov)?-[a-z]+-\d{1,2}$/,
  bucket: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
};
export const R2_PATTERNS = {
  accountId: /^[a-f0-9]{32}$/,
  accessKeyId: /^[a-f0-9]{32}$/,
  secretAccessKey: /^[a-f0-9]{64}$/,
  bucket: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
};

function checkKey(key: string): string {
  if (!OBJECT_KEY_RE.test(key)) throw new StorageError("invalid", "Bad object key.");
  return key;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const TIMEOUT_MS = 15_000;

/** S3 and R2 speak the same API; only the host and the region differ. */
function s3Compatible(kind: "s3" | "r2", base: string, region: string, keys: { accessKeyId: string; secretAccessKey: string }, fetcher: Fetcher): ObjectBackend {
  const label = kind === "s3" ? "Amazon S3" : "Cloudflare R2";
  const scrub = (m: string) => m.split(keys.secretAccessKey).join("••••").split(keys.accessKeyId).join("••••").replace(/[\r\n]+/g, " ").slice(0, 300);
  async function send(method: "GET" | "PUT" | "DELETE", key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const url = new URL(`${base}/${checkKey(key)}`);
    const headers = signRequest({ method, url, region, ...keys, body, headers: contentType ? { "content-type": contentType } : {} });
    delete headers.host; // set by fetch from the URL
    let res: Response;
    try {
      res = await fetcher(url.toString(), { method, headers, body: body ? Buffer.from(body) : undefined, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new StorageError("unavailable", `Could not reach ${label}. Check the connection and try again.`);
    }
    if (res.ok) return res;
    const text = (await res.text().catch(() => "")).slice(0, 2_000);
    if (res.status === 404 && method === "GET") throw new StorageError("not_found", "File not found in storage.");
    const code = /<Code>([^<]{1,80})<\/Code>/.exec(text)?.[1];
    const msg = /<Message>([^<]{1,200})<\/Message>/.exec(text)?.[1];
    throw new StorageError(res.status >= 500 || res.status === 429 ? "unavailable" : "rejected", scrub(`${label} refused the request (HTTP ${res.status}${code ? `, ${code}` : ""})${msg ? `: ${msg}` : "."}`));
  }
  return {
    kind,
    async put(key, bytes, contentType) {
      await send("PUT", key, bytes, contentType);
    },
    async get(key) {
      return new Uint8Array(await (await send("GET", key)).arrayBuffer());
    },
    async delete(key) {
      await send("DELETE", key);
    },
  };
}

export function s3Backend(cfg: S3Config, fetcher: Fetcher = fetch): ObjectBackend {
  for (const [k, re] of Object.entries(S3_PATTERNS)) if (!re.test(cfg[k as keyof S3Config])) throw new StorageError("invalid", `Bad S3 ${k}.`);
  return s3Compatible("s3", `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`, cfg.region, cfg, fetcher);
}

export function r2Backend(cfg: R2Config, fetcher: Fetcher = fetch): ObjectBackend {
  for (const [k, re] of Object.entries(R2_PATTERNS)) if (!re.test(cfg[k as keyof R2Config])) throw new StorageError("invalid", `Bad R2 ${k}.`);
  return s3Compatible("r2", `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`, "auto", cfg, fetcher);
}

/** The folder on this server. Set by STORAGE_LOCAL_DIR (deploy setting, never typed in the admin). */
export function localDir(env: Record<string, string | undefined> = process.env): string {
  // Runtime data, not part of the build: kept out of output file tracing.
  return resolve(/*turbopackIgnore: true*/ env.STORAGE_LOCAL_DIR?.trim() || ".data/uploads");
}

export function localBackend(dir: string = localDir()): ObjectBackend {
  const root = resolve(/*turbopackIgnore: true*/ dir);
  const pathOf = (key: string) => {
    const p = resolve(/*turbopackIgnore: true*/ root, checkKey(key));
    if (!p.startsWith(root + sep)) throw new StorageError("invalid", "Bad object key.");
    return p;
  };
  return {
    kind: "local",
    async put(key, bytes) {
      const p = pathOf(key);
      try {
        await mkdir(/*turbopackIgnore: true*/ dirname(p), { recursive: true, mode: 0o700 });
        await writeFile(/*turbopackIgnore: true*/ p, bytes, { flag: "wx", mode: 0o600 }); // never overwrite an existing file
      } catch (e) {
        throw new StorageError("unavailable", `Could not write to the server folder (${(e as NodeJS.ErrnoException).code ?? "error"}).`);
      }
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(/*turbopackIgnore: true*/ pathOf(key)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new StorageError("not_found", "File not found in storage.");
        throw new StorageError("unavailable", "Could not read from the server folder.");
      }
    },
    async delete(key) {
      await rm(/*turbopackIgnore: true*/ pathOf(key), { force: true });
    },
  };
}

/** Write → read back → delete a small probe object. */
export async function probeBackend(backend: ObjectBackend): Promise<{ ok: boolean; message: string }> {
  const key = `.probe/${randomBytes(12).toString("hex")}.txt`;
  const body = new TextEncoder().encode(`alpha-hood storage check ${new Date().toISOString()}`);
  try {
    await backend.put(key, body, "text/plain");
    const back = await backend.get(key);
    await backend.delete(key);
    return Buffer.from(back).equals(Buffer.from(body)) ? { ok: true, message: "Connection works — write, read back and delete verified." } : { ok: false, message: "The file was written but read back differently." };
  } catch (e) {
    return { ok: false, message: e instanceof StorageError ? e.message : "The storage check failed." };
  }
}
