import { createHash } from "node:crypto";
import type { Env } from "@/lib/mock-guard";
import { asObject, normaliseEmail, rejectUnknownFields } from "@/lib/validation";
import { type SettingField, type SettingGroup, SETTING_GROUPS, settingGroup } from "./catalog";
import { applySettings, envValue, isFromDatabase, unreadableKeys } from "./runtime";
import type { SettingsStore } from "./store";

/**
 * Admin → Settings: the one service behind the page and its API. It builds the payload (never a secret), validates
 * a group's form against the catalogue, saves atomically and re-applies the result to this server.
 */
export class SettingsError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "SettingsError";
  }
}

export interface FieldState {
  key: string;
  label: string;
  type: SettingField["type"];
  secret: boolean;
  required: boolean;
  help: string | null;
  placeholder: string | null;
  options: { value: string; label: string }[] | null;
  range: { min: number; max: number; def: number; unit: string } | null;
  isSet: boolean;
  source: "database" | "env" | null;
  /** Secrets: always null — a description is sent instead, never the thing itself. */
  value: string | null;
  /** Secrets only: length and a short fingerprint, enough to tell two keys apart. */
  hint: string | null;
  /** True when the environment holds a value this field would fall back to. */
  envFallback: boolean;
}

export interface GroupState {
  id: string;
  label: string;
  description: string;
  warning: string | null;
  stepUp: boolean;
  /** Set when the store does not read these values yet (the feature is not built). */
  notInUse: string | null;
  fields: FieldState[];
  missingRequired: string[];
}

export interface SettingsPayload {
  groups: GroupState[];
  /** Saved rows that can't be decrypted with the current SECRET_BOX_KEY (names only). */
  unreadable: string[];
}

const fingerprint = (v: string) => `${v.length} characters · ${createHash("sha256").update(v).digest("hex").slice(0, 6)}`;

function fieldState(f: SettingField, env: Env): FieldState {
  const effective = (env[f.env] ?? "").trim();
  const fromDb = isFromDatabase(f.env);
  return {
    key: f.env,
    label: f.label,
    type: f.type,
    secret: !!f.secret,
    required: !!f.required,
    help: f.help ?? null,
    placeholder: f.placeholder ?? null,
    options: f.options ? f.options.map((o) => ({ ...o })) : null,
    range: f.range ? { ...f.range } : null,
    isSet: effective !== "",
    source: effective === "" ? null : fromDb ? "database" : "env",
    // A switch shows what is in force: with nothing set, its default.
    value: f.secret ? null : f.type === "bool" && effective === "" ? (f.defaultOn ? "true" : "false") : effective,
    hint: f.secret && effective !== "" ? fingerprint(effective) : null,
    envFallback: envValue(f.env, env) !== "",
  };
}

function groupState(g: SettingGroup, env: Env): GroupState {
  const fields = g.fields.map((f) => fieldState(f, env));
  return {
    id: g.id,
    label: g.label,
    description: g.description,
    warning: g.warning ?? null,
    stepUp: !!g.stepUp,
    notInUse: g.notInUse ?? null,
    fields,
    missingRequired: fields.filter((f) => f.required && !f.isSet).map((f) => f.label),
  };
}

/** Everything the settings page shows. Loads the store first so the page never shows another instance's past. */
export async function settingsPayload(store: SettingsStore, env: Env = process.env): Promise<SettingsPayload> {
  applySettings(await store.all(), env);
  return { groups: SETTING_GROUPS.map((g) => groupState(g, env)), unreadable: unreadableKeys() };
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** One field's submitted value → the string to store, or throws with the message to show under the field. */
function clean(f: SettingField, raw: unknown): string {
  if (f.type === "bool") {
    if (typeof raw !== "boolean") throw new Error("Choose on or off.");
    return raw ? "true" : "false";
  }
  if (typeof raw !== "string") throw new Error("Enter text.");
  const v = (f.type === "text" ? raw.replace(/\r\n?/g, "\n") : raw).trim();
  if (v === "") return "";
  const max = f.max ?? (f.type === "text" ? 2000 : 500);
  if (v.length > max) throw new Error(`At most ${max} characters.`);
  if (CONTROL.test(v) || (f.type !== "text" && /[\r\n]/.test(v))) throw new Error("Remove line breaks and control characters.");
  switch (f.type) {
    case "email": {
      const email = normaliseEmail(v);
      if (!email) throw new Error("Enter a valid email address.");
      return email;
    }
    case "url": {
      // https only, no credentials — these are rendered as links on the storefront.
      let u: URL;
      try {
        u = new URL(v);
      } catch {
        throw new Error("Enter a full https:// address.");
      }
      if (u.protocol !== "https:" || u.username || u.password || !/^https:\/\/[^\s"'<>]+$/.test(v)) throw new Error("Enter a full https:// address.");
      return v;
    }
    case "int": {
      const n = Number(v);
      if (!/^\d{1,6}$/.test(v) || !f.range || n < f.range.min || n > f.range.max) throw new Error(`Enter a whole number from ${f.range?.min} to ${f.range?.max}.`);
      return String(n);
    }
    case "select":
      if (!f.options?.some((o) => o.value === v)) throw new Error("Choose one of the options.");
      return v;
    default:
      if (f.pattern && !f.pattern.test(v)) throw new Error(f.patternHint ?? "This doesn't look right.");
      return v;
  }
}

export interface SaveResult {
  /** Field keys that changed — for the audit log and the toast. Never their values. */
  changed: string[];
  group: GroupState;
}

/**
 * Saves one group. Body: `{ fields: { KEY: value }, clear: [KEY] }`.
 * - A text field left blank keeps what is stored (secrets arrive blank on every load, so blank can't mean
 *   "delete"); to remove a saved value, name it in `clear` — it then falls back to the environment.
 * - Switches always save their state: an explicit off must win over an environment "true".
 * - Unknown group → 404; unknown field → 422 (mass-assignment); nothing outside the catalogue is ever written.
 */
export async function saveSettingsGroup(store: SettingsStore, groupId: string, body: unknown, by: string, env: Env = process.env, now = new Date()): Promise<SaveResult> {
  const group = settingGroup(groupId);
  if (!group) throw new SettingsError(404, "not_found", "Unknown settings section.");
  const input = asObject(body);
  rejectUnknownFields(input, ["fields", "clear", "code"]);
  const fields = asObject(input.fields ?? {});
  const keys = group.fields.map((f) => f.env);
  rejectUnknownFields(fields, keys);
  const clearRaw = input.clear ?? [];
  if (!Array.isArray(clearRaw) || clearRaw.some((k) => typeof k !== "string" || !keys.includes(k))) throw new SettingsError(422, "invalid_input", "Unknown field to remove.");
  const clear = [...new Set(clearRaw as string[])];

  const current = new Map((await store.all()).map((r) => [r.key, r.value]));
  const set: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const f of group.fields) {
    if (clear.includes(f.env) || !(f.env in fields)) continue;
    let value: string;
    try {
      value = clean(f, fields[f.env]);
    } catch (e) {
      errors[f.env] = e instanceof Error ? e.message : "Invalid value.";
      continue;
    }
    if (value === "") continue; // blank = keep
    // Unchanged: same as the saved row, or (nothing saved) same as the environment — don't pin a copy of .env.
    // A switch with nothing saved and no "true" in the environment is already off.
    const saved = current.get(f.env);
    const fromEnv = envValue(f.env, env);
    const fallback = f.type === "bool" ? (fromEnv === "" ? (f.defaultOn ? "true" : "false") : fromEnv === "true" ? "true" : "false") : fromEnv;
    if (saved === value || (saved === undefined && fallback === value)) continue;
    set[f.env] = value;
  }
  if (Object.keys(errors).length) throw new SettingsError(422, "invalid_input", "Check the highlighted fields.", errors);

  const removed = clear.filter((k) => current.has(k));
  const changed = [...removed, ...Object.keys(set)];
  if (changed.length) {
    await store.write({ set, clear: removed }, by, now);
    applySettings(await store.all(), env);
  }
  return { changed, group: groupState(group, env) };
}
