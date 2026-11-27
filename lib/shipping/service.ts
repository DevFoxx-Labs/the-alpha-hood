import { PINCODES_FILE, pincodePlace } from "@/lib/geo/pincodes";
import { ProviderError } from "@/lib/providers/errors";
import type { Change } from "@/lib/providers/http";
import type { ProviderStore } from "@/lib/providers/store";
import { asObject, normaliseEmail, rejectUnknownFields } from "@/lib/validation";
import { existsSync } from "node:fs";
import { clearDeliveryCache } from "./index";
import { refreshShipping, SHIPPING_ID, type ShippingDoc } from "./runtime";
import { type Fetcher, forgetShiprocketTokens, shiprocketCheck, ShiprocketError, type ShiprocketConfig } from "./shiprocket";
import { PINCODE_RE } from "./common";

/**
 * Admin → Shipping (owner only): the Shiprocket API user that answers every delivery check (PDP, checkout).
 * - The password is sealed in the database and write-only (never returned; blank = keep).
 * - Shiprocket can go live only after a passing live test (sign-in + a real serviceability check).
 * - Changing the LIVE account's sign-in or pickup is tested before anything is saved (checks must keep working).
 * - Shiprocket's host is fixed in code; nothing here is a URL.
 */
export interface ShippingPayload {
  /** What answers delivery checks right now. */
  mode: "shiprocket" | "demo" | "none";
  configured: boolean;
  /** False when the saved row can't be opened with the current SECRET_BOX_KEY — enter the password again. */
  readable: boolean;
  active: boolean;
  verified: boolean;
  lastTest: ShippingDoc["lastTest"];
  fields: { email: string | null; pickupPincode: string | null; weightKg: number | null };
  passwordSet: boolean;
  /** India Post directory for town / state names (data/pincodes.json). */
  directory: { loaded: boolean; sample: string | null };
}

const maskEmail = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, "$1•••$2");

export async function shippingPayload(store: ProviderStore, env: Record<string, string | undefined> = process.env): Promise<ShippingPayload> {
  const row = (await store.list<ShippingDoc>("shipping")).find((r) => r.id === SHIPPING_ID);
  const d = row?.doc ?? null;
  const sr = d?.shiprocket;
  const sample = pincodePlace("110001");
  return {
    mode: row?.active && sr ? "shiprocket" : env.NODE_ENV !== "production" || env.ALLOW_MOCK_DATA === "true" ? "demo" : "none",
    configured: !!sr,
    readable: !row || d !== null,
    active: !!row?.active,
    verified: d?.lastTest?.ok === true,
    lastTest: d?.lastTest ?? null,
    fields: { email: sr ? maskEmail(sr.email) : null, pickupPincode: sr?.pickupPincode ?? null, weightKg: sr?.weightKg ?? null },
    passwordSet: !!sr?.password,
    directory: { loaded: existsSync(PINCODES_FILE) && !!sample, sample: sample ? `110001 → ${sample.city}, ${sample.state}` : null },
  };
}

const PASSWORD_RE = /^[\x20-\x7e]{6,128}$/;

/** Validates the form; a blank password keeps the stored one; a blank email keeps it too (it's shown masked). */
function parse(body: unknown, existing: ShiprocketConfig | undefined): ShiprocketConfig {
  const input = asObject(body);
  rejectUnknownFields(input, ["email", "password", "pickupPincode", "weightKg", "code"]);
  const errors: Record<string, string> = {};
  const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
  const email = rawEmail === "" ? (existing?.email ?? null) : normaliseEmail(rawEmail);
  if (!email) errors.email = "Enter the API user's email (Shiprocket → Settings → API).";
  const rawPw = typeof input.password === "string" ? input.password : "";
  const password = rawPw === "" ? (existing?.password ?? "") : rawPw;
  if (!PASSWORD_RE.test(password)) errors.password = rawPw === "" ? "Enter the API user's password." : "6–128 characters, no line breaks.";
  const pickupPincode = typeof input.pickupPincode === "string" ? input.pickupPincode.trim() : "";
  if (!PINCODE_RE.test(pickupPincode)) errors.pickupPincode = "The 6-digit pincode of your pickup address in Shiprocket.";
  const weightKg = typeof input.weightKg === "number" ? input.weightKg : typeof input.weightKg === "string" ? Number(input.weightKg) : NaN;
  if (!Number.isFinite(weightKg) || weightKg < 0.1 || weightKg > 30) errors.weightKg = "A parcel weight between 0.1 and 30 kg.";
  if (Object.keys(errors).length) throw new ProviderError(422, "invalid_input", "Check the highlighted fields.", errors);
  return { email: email!, password, pickupPincode, weightKg: Math.round(weightKg * 100) / 100 };
}

export interface ShippingDeps {
  fetcher?: Fetcher;
  now?: Date;
  env?: Record<string, string | undefined>;
}

/** Signs in and checks one pincode. The message is safe to show (no secrets). */
async function probe(cfg: ShiprocketConfig, pincode: string, deps: ShippingDeps): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await shiprocketCheck(cfg, pincode, deps.fetcher, deps.now);
    if (!r.serviceable) return { ok: true, message: `Signed in. No courier serves ${pincode} from ${cfg.pickupPincode} — try another pincode to see a delivery date.` };
    const where = r.city ? ` (${r.city}${r.state ? `, ${r.state}` : ""})` : "";
    return { ok: true, message: `Connected. ${r.couriers} courier${r.couriers === 1 ? "" : "s"} deliver to ${pincode}${where}; standard delivery by ${r.standardBy}${r.express ? `, express by ${r.express.by}` : ""}; COD ${r.cod.available ? "available" : "not available"}.` };
  } catch (e) {
    return { ok: false, message: e instanceof ShiprocketError ? e.message : "The test failed unexpectedly." };
  }
}

const sameConnection = (a: ShiprocketConfig | undefined, b: ShiprocketConfig) => !!a && a.email === b.email && a.password === b.password && a.pickupPincode === b.pickupPincode && a.weightKg === b.weightKg;

export async function saveShipping(store: ProviderStore, body: unknown, by: string, deps: ShippingDeps = {}): Promise<Change & { payload: ShippingPayload }> {
  const now = deps.now ?? new Date();
  const row = await store.get<ShippingDoc>("shipping", SHIPPING_ID);
  if (row && !row.doc && asObject(body).password === "") throw new ProviderError(409, "unreadable", "The saved password can't be read. Enter it again.");
  const before = row?.doc ?? null;
  const cfg = parse(body, before?.shiprocket);
  const changed = !sameConnection(before?.shiprocket, cfg);
  let lastTest = changed ? null : (before?.lastTest ?? null);
  if (changed && row?.active) {
    // The live account answers every delivery check: prove the new settings first.
    const t = await probe(cfg, "110001", deps);
    if (!t.ok) throw new ProviderError(422, "test_failed", `Not saved: Shiprocket didn't work with these settings. ${t.message}`);
    lastTest = { ...t, at: now.toISOString() };
  }
  if (changed) forgetShiprocketTokens();
  const doc: ShippingDoc = { shiprocket: cfg, lastTest, activatedAt: before?.activatedAt ?? null, updatedBy: by, updatedAtIso: now.toISOString() };
  await store.put("shipping", SHIPPING_ID, doc, now);
  await refreshShipping(store, deps.env);
  if (changed && row?.active) clearDeliveryCache();
  return { payload: await shippingPayload(store, deps.env), liveChanged: changed && !!row?.active, summary: "Saved the Shiprocket settings." };
}

export async function testShipping(store: ProviderStore, body: unknown, by: string, deps: ShippingDeps = {}): Promise<{ ok: boolean; message: string; payload: ShippingPayload }> {
  const input = asObject(body);
  rejectUnknownFields(input, ["pincode"]);
  const pincode = input.pincode === undefined || input.pincode === "" ? "110001" : String(input.pincode).trim();
  if (!PINCODE_RE.test(pincode)) throw new ProviderError(422, "invalid_input", "Enter a 6-digit pincode to test.", { pincode: "A 6-digit pincode." });
  const now = deps.now ?? new Date();
  const row = await store.get<ShippingDoc>("shipping", SHIPPING_ID);
  if (row && !row.doc) throw new ProviderError(409, "unreadable", "The saved password can't be read. Enter it again.");
  if (!row?.doc?.shiprocket) throw new ProviderError(409, "not_configured", "Save the Shiprocket API user first, then test.");
  const result = await probe(row.doc.shiprocket, pincode, deps);
  // A failed test on the live account doesn't switch it off — it records the result.
  await store.put("shipping", SHIPPING_ID, { ...row.doc, lastTest: { ...result, at: now.toISOString() }, updatedBy: by, updatedAtIso: now.toISOString() }, now);
  return { ...result, payload: await shippingPayload(store, deps.env) };
}

/** `choice`: "shiprocket" (needs a passing test) or "off" (the demo in development, "unavailable" in production). */
export async function activateShipping(store: ProviderStore, choice: unknown, by: string, deps: ShippingDeps = {}): Promise<Change & { payload: ShippingPayload }> {
  if (choice !== "shiprocket" && choice !== "off") throw new ProviderError(422, "invalid_input", "Choose Shiprocket or off.");
  const now = deps.now ?? new Date();
  const row = await store.get<ShippingDoc>("shipping", SHIPPING_ID);
  const wasLive = !!row?.active;
  if (choice === "off") {
    if (!wasLive) return { payload: await shippingPayload(store, deps.env), liveChanged: false, summary: "No change." };
    await store.setActive("shipping", null, now);
  } else {
    if (wasLive) return { payload: await shippingPayload(store, deps.env), liveChanged: false, summary: "No change." };
    if (row?.doc?.lastTest?.ok !== true) throw new ProviderError(409, "not_verified", "Run a successful test before making Shiprocket live.");
    await store.put("shipping", SHIPPING_ID, { ...row.doc, activatedAt: row.doc.activatedAt ?? now.toISOString(), updatedBy: by, updatedAtIso: now.toISOString() }, now);
    if (!(await store.setActive("shipping", SHIPPING_ID, now))) throw new ProviderError(404, "not_found", "Save the Shiprocket settings first.");
  }
  await refreshShipping(store, deps.env);
  clearDeliveryCache();
  return { payload: await shippingPayload(store, deps.env), liveChanged: true, summary: choice === "shiprocket" ? "Shiprocket now answers delivery checks." : "Shiprocket switched off for delivery checks." };
}
