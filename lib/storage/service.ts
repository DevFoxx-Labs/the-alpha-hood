import { ProviderError } from "@/lib/providers/errors";
import type { Change } from "@/lib/providers/http";
import type { ProviderStore } from "@/lib/providers/store";
import { asObject, rejectUnknownFields } from "@/lib/validation";
import { BACKEND_KINDS, type BackendKind, type Fetcher, localBackend, localDir, probeBackend, R2_PATTERNS, r2Backend, S3_PATTERNS, s3Backend } from "./backends";
import { backendFor, refreshStorage, STORAGE_IDS, type StorageDoc } from "./runtime";

/**
 * Admin → Storage (owner only), the same choices as the reference panel: the database (default), a folder on this
 * server, Amazon S3 or Cloudflare R2. One of them takes new uploads.
 * - Keys are sealed and write-only (only a masked hint is returned).
 * - A backend can be made active only after a passing connection test (write → read back → delete).
 * - Saving new keys for the ACTIVE backend is tested before anything is saved.
 * - Once a backend has been active, its bucket / region / account are locked: photos stored there must stay
 *   readable. Keys can still be rotated (with a test).
 */
export type StorageChoice = "database" | BackendKind;
export const STORAGE_CHOICES: readonly StorageChoice[] = ["database", ...BACKEND_KINDS];

export interface BackendView {
  kind: BackendKind;
  configured: boolean;
  readable: boolean;
  active: boolean;
  everActive: boolean;
  verified: boolean;
  lastTest: StorageDoc["lastTest"];
  /** Non-secret fields as saved; secret ones never. */
  fields: Record<string, string>;
  keyHint: string | null;
  secretSet: boolean;
}

export interface StoragePayload {
  active: StorageChoice;
  backends: BackendView[];
  localDir: string;
  /** True on hosts where the server's disk is not kept between deploys (local storage would lose files). */
  ephemeralDisk: boolean;
}

const hint = (v: string | undefined) => (!v ? null : `${v.slice(0, 4)}••••${v.slice(-2)}`);

export async function storagePayload(store: ProviderStore, env: Record<string, string | undefined> = process.env): Promise<StoragePayload> {
  const rows = await store.list<StorageDoc>("storage");
  const backends = BACKEND_KINDS.map((kind): BackendView => {
    const row = rows.find((r) => r.id === STORAGE_IDS[kind]);
    const d = row?.doc ?? null;
    const creds = kind === "s3" ? d?.s3 : kind === "r2" ? d?.r2 : undefined;
    const fields: Record<string, string> = kind === "s3" && d?.s3 ? { region: d.s3.region, bucket: d.s3.bucket } : kind === "r2" && d?.r2 ? { accountId: d.r2.accountId, bucket: d.r2.bucket } : {};
    return {
      kind,
      configured: kind === "local" || !!creds,
      readable: !row || d !== null,
      active: !!row?.active,
      everActive: !!d?.activatedAt,
      verified: d?.lastTest?.ok === true,
      lastTest: d?.lastTest ?? null,
      fields,
      keyHint: hint(creds?.accessKeyId),
      secretSet: !!creds?.secretAccessKey,
    };
  });
  return {
    active: backends.find((b) => b.active)?.kind ?? "database",
    backends,
    localDir: localDir(env),
    ephemeralDisk: !!(env.VERCEL || env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME),
  };
}

function parseKind(v: string): BackendKind {
  if (!(BACKEND_KINDS as readonly string[]).includes(v)) throw new ProviderError(404, "not_found", "Unknown storage.");
  return v as BackendKind;
}

/** Validates the S3 / R2 form; blank key fields keep what is stored. */
function parseConfig(kind: "s3" | "r2", body: unknown, existing: StorageDoc | null) {
  const input = asObject(body);
  const names = kind === "s3" ? ["accessKeyId", "secretAccessKey", "region", "bucket"] : ["accountId", "accessKeyId", "secretAccessKey", "bucket"];
  rejectUnknownFields(input, [...names, "code"]);
  const patterns: Record<string, RegExp> = kind === "s3" ? S3_PATTERNS : R2_PATTERNS;
  const old = (existing?.[kind] ?? {}) as Record<string, string>;
  const out: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const n of names) {
    const raw = typeof input[n] === "string" ? (input[n] as string).trim() : "";
    const v = raw === "" && (n === "accessKeyId" || n === "secretAccessKey") ? (old[n] ?? "") : raw;
    if (!patterns[n].test(v)) errors[n] = MESSAGES[kind][n];
    else out[n] = v;
  }
  // Photos already stored there must stay readable: where they live can't change.
  if (existing?.activatedAt) {
    for (const n of kind === "s3" ? ["region", "bucket"] : ["accountId", "bucket"]) {
      if (out[n] && old[n] && out[n] !== old[n]) errors[n] = "Locked: photos are already stored in this bucket. Keys can still be changed.";
    }
  }
  if (Object.keys(errors).length) throw new ProviderError(422, "invalid_input", "Check the highlighted fields.", errors);
  return out;
}

const MESSAGES: Record<"s3" | "r2", Record<string, string>> = {
  s3: {
    accessKeyId: "An access key ID starts with AKIA and has 20 characters.",
    secretAccessKey: "The secret access key has 40 characters.",
    region: "A region like ap-south-1.",
    bucket: "3–63 lower-case letters, digits and dashes (no dots).",
  },
  r2: {
    accountId: "The 32-character account ID from the Cloudflare dashboard.",
    accessKeyId: "The 32-character access key ID of an R2 API token.",
    secretAccessKey: "The 64-character secret access key of an R2 API token.",
    bucket: "3–63 lower-case letters, digits and dashes.",
  },
};

export interface StorageDeps {
  fetcher?: Fetcher;
  now?: Date;
  env?: Record<string, string | undefined>;
}

export async function saveBackend(store: ProviderStore, kindRaw: string, body: unknown, by: string, deps: StorageDeps = {}): Promise<Change & { payload: StoragePayload }> {
  const kind = parseKind(kindRaw);
  if (kind === "local") throw new ProviderError(422, "invalid_input", "The server folder is set by STORAGE_LOCAL_DIR on the host, not here.");
  const now = deps.now ?? new Date();
  const row = await store.get<StorageDoc>("storage", STORAGE_IDS[kind]);
  const before = row?.doc ?? null;
  const creds = parseConfig(kind, body, before);
  const changed = JSON.stringify(before?.[kind] ?? null) !== JSON.stringify(creds);
  let lastTest = changed ? null : (before?.lastTest ?? null);
  if (changed && row?.active) {
    // The active storage takes every new upload: prove the new keys first.
    const backend = kind === "s3" ? s3Backend(creds as never, deps.fetcher) : r2Backend(creds as never, deps.fetcher);
    const t = await probeBackend(backend);
    if (!t.ok) throw new ProviderError(422, "test_failed", `Not saved: the active storage could not be reached with these keys. ${t.message}`);
    lastTest = { ...t, at: now.toISOString() };
  }
  const doc: StorageDoc = { ...(before ?? {}), [kind]: creds, lastTest, activatedAt: before?.activatedAt ?? null, updatedBy: by, updatedAtIso: now.toISOString() };
  await store.put("storage", STORAGE_IDS[kind], doc, now);
  await refreshStorage(store, deps.env);
  return { payload: await storagePayload(store, deps.env), liveChanged: changed && !!row?.active, summary: `Saved the ${kind === "s3" ? "Amazon S3" : "Cloudflare R2"} storage settings.` };
}

export async function testBackend(store: ProviderStore, kindRaw: string, by: string, deps: StorageDeps = {}): Promise<{ ok: boolean; message: string; payload: StoragePayload }> {
  const kind = parseKind(kindRaw);
  const now = deps.now ?? new Date();
  const row = await store.get<StorageDoc>("storage", STORAGE_IDS[kind]);
  if (row && !row.doc) throw new ProviderError(409, "unreadable", "These keys can't be read. Enter them again.");
  const backend =
    kind === "local"
      ? localBackend(localDir(deps.env))
      : deps.fetcher && row?.doc?.[kind]
        ? kind === "s3"
          ? s3Backend(row.doc.s3!, deps.fetcher)
          : r2Backend(row.doc.r2!, deps.fetcher)
        : backendFor(kind, row?.doc ?? null, deps.env);
  if (!backend) throw new ProviderError(409, "not_configured", "Save the keys first, then test.");
  const result = await probeBackend(backend);
  const doc: StorageDoc = { ...(row?.doc ?? {}), lastTest: { ...result, at: now.toISOString() }, activatedAt: row?.doc?.activatedAt ?? null, updatedBy: by, updatedAtIso: now.toISOString() };
  await store.put("storage", STORAGE_IDS[kind], doc, now);
  return { ...result, payload: await storagePayload(store, deps.env) };
}

/** Makes `choice` take new uploads ("database" = none of the backends). */
export async function activateStorage(store: ProviderStore, choice: unknown, by: string, deps: StorageDeps = {}): Promise<Change & { payload: StoragePayload }> {
  if (typeof choice !== "string" || !(STORAGE_CHOICES as readonly string[]).includes(choice)) throw new ProviderError(422, "invalid_input", "Choose where new uploads go.");
  const now = deps.now ?? new Date();
  const current = (await storagePayload(store, deps.env)).active;
  if (current === choice) return { payload: await storagePayload(store, deps.env), liveChanged: false, summary: "No change." };
  if (choice === "database") {
    await store.setActive("storage", null, now);
  } else {
    const kind = choice as BackendKind;
    const row = await store.get<StorageDoc>("storage", STORAGE_IDS[kind]);
    if (row?.doc?.lastTest?.ok !== true) throw new ProviderError(409, "not_verified", "Run a successful connection test before making this storage active.");
    await store.put("storage", STORAGE_IDS[kind], { ...row.doc, activatedAt: row.doc.activatedAt ?? now.toISOString(), updatedBy: by, updatedAtIso: now.toISOString() }, now);
    if (!(await store.setActive("storage", STORAGE_IDS[kind], now))) throw new ProviderError(404, "not_found", "Save this storage first.");
  }
  await refreshStorage(store, deps.env);
  const label = { database: "the database", local: "the server folder", s3: "Amazon S3", r2: "Cloudflare R2" }[choice as StorageChoice];
  return { payload: await storagePayload(store, deps.env), liveChanged: true, summary: `New uploads now go to ${label} (was ${current}).` };
}
