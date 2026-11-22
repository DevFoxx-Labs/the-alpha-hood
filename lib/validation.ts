import { ValidationError } from "@/lib/http/guard";

/** Small server-side allow-list validators shared by the public forms. */

/** Removes control characters (keeps newlines when asked), trims and bounds the length. */
export function cleanText(value: unknown, field: string, { max, min = 0, multiline = false }: { max: number; min?: number; multiline?: boolean }): string {
  if (typeof value !== "string") throw new ValidationError(`${field} is required.`);
  const stripped = multiline
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    : value.replace(/[\u0000-\u001F\u007F]/g, " ");
  const text = stripped.trim();
  if (text.length < min) throw new ValidationError(min <= 1 ? `${field} is required.` : `${field} is too short.`);
  if (text.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return text;
}

const EMAIL_RE = /^[^\s@"<>()[\]\\,;:]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** Indian mobile numbers: 10 digits starting 6–9, optional +91 / 91 / 0 prefix. Returns `+91XXXXXXXXXX`. */
export function normaliseIndianMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s()-]/g, "");
  const m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? `+91${m[1]}` : null;
}

/** Masks a contact for display/logs: `ra***@gmail.com`, `+91******3210`. */
export function maskContact(contact: string): string {
  if (contact.includes("@")) {
    const [user, domain] = contact.split("@");
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return `${contact.slice(0, 3)}******${contact.slice(-4)}`;
}

export function rejectUnknownFields(input: Record<string, unknown>, allowed: string[]) {
  const set = new Set(allowed);
  for (const key of Object.keys(input)) if (!set.has(key)) throw new ValidationError(`Unknown field "${key}".`);
}

export function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ValidationError("Expected an object.");
  return body as Record<string, unknown>;
}
