import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 for S3-compatible APIs (Amazon S3, Cloudflare R2) — no SDK.
 * Every header passed in is signed (lower-cased, sorted). The payload hash is always computed (never UNSIGNED).
 * Verified against the "GET Object" example in the Amazon S3 SigV4 documentation (lib/storage/storage.test.ts).
 */
export const sha256hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

export interface SignInput {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Extra headers to sign and send (e.g. content-type, range). `host`, `x-amz-date`, `x-amz-content-sha256` are added. */
  headers?: Record<string, string>;
  body?: Uint8Array;
  now?: Date;
}

/** RFC 3986 encoding of one path segment, as S3 expects. */
const encodeSegment = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function amzDate(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function signRequest(input: SignInput): Record<string, string> {
  const date = amzDate(input.now ?? new Date());
  const day = date.slice(0, 8);
  const payloadHash = sha256hex(input.body ?? new Uint8Array());
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  headers.host = input.url.host;
  headers["x-amz-content-sha256"] = payloadHash;
  headers["x-amz-date"] = date;
  const names = Object.keys(headers).sort();
  const canonicalUri = input.url.pathname.split("/").map((seg) => encodeSegment(decodeURIComponent(seg))).join("/");
  const canonicalQuery = [...input.url.searchParams.entries()]
    .map(([k, v]) => `${encodeSegment(k)}=${encodeSegment(v)}`)
    .sort()
    .join("&");
  const canonicalRequest = [input.method, canonicalUri, canonicalQuery, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256hex(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(stringToSign).digest("hex");
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}
