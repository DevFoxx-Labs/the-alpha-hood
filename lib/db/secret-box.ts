import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption at rest for secrets the database must hold (staff TOTP secrets, pending enrolment secrets).
 * AES-256-GCM with a random 96-bit IV per value; stored as `v1:<iv>:<tag>:<ciphertext>` (base64url). The key comes
 * from `SECRET_BOX_KEY` (32 random bytes, base64) in the host's secret store — never in the database or git.
 * - Production without a valid key: refused (fail closed) — nothing is written in the clear.
 * - Development / tests without a key: a fixed dev-only key (local data only; never accepted in production).
 * Rotation: `previousKeys` lets old values be read while new ones are written with the current key.
 */
export class SecretBoxError extends Error {}

type Env = Record<string, string | undefined>;
const DEV_KEY = createHash("sha256").update("alpha-hood-dev-only-secret-box-key").digest();

function parseKey(v: string | undefined): Buffer | null {
  if (!v) return null;
  const b = Buffer.from(v, "base64");
  return b.length === 32 ? b : null;
}

export interface SecretBox {
  seal(plain: string): string;
  open(sealed: string): string;
}

export function createSecretBox(env: Env = process.env): SecretBox {
  const key = parseKey(env.SECRET_BOX_KEY);
  if (!key && env.NODE_ENV === "production") throw new SecretBoxError("SECRET_BOX_KEY (32 bytes, base64) is required in production.");
  const current = key ?? DEV_KEY;
  const previous = (env.SECRET_BOX_PREVIOUS_KEYS ?? "")
    .split(",")
    .map((k) => parseKey(k.trim()))
    .filter((k): k is Buffer => !!k);
  const keys = [current, ...previous];
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", current, iv);
      const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
    },
    open(sealed) {
      const [v, iv, tag, ct] = sealed.split(":");
      if (v !== "v1" || !iv || !tag || !ct) throw new SecretBoxError("Unreadable sealed value.");
      for (const k of keys) {
        try {
          const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
          d.setAuthTag(Buffer.from(tag, "base64url"));
          return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
        } catch {
          // try the next (older) key
        }
      }
      throw new SecretBoxError("Sealed value can't be opened with the configured keys.");
    },
  };
}
