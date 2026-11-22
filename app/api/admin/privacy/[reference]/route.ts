import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { jsonError } from "@/lib/http/guard";
import { resolveInbox } from "@/lib/privacy/requests";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";

const STATUSES = ["acknowledged", "in_progress", "resolved", "rejected"] as const;

/** POST `{ status, note }` — move a privacy request / grievance along (note is kept in its log; audited). */
export async function POST(request: Request, { params }: RouteContext<"/api/admin/privacy/[reference]">) {
  const w = await adminWrite(request, "privacy.write", "privacy", 2_048);
  if (!w.ok) return w.response;
  const { reference } = await params;
  if (!/^PR-[A-Z2-9]{8}$/.test(reference)) return jsonError(404, "not_found", "Request not found.");
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["status", "note"]);
    const status = STATUSES.find((s) => s === input.status);
    if (!status) return jsonError(422, "invalid_input", "Choose a status.");
    const note = cleanText(input.note, "Note", { min: 3, max: 1000, multiline: true });
    const updated = await resolveInbox().setStatus(reference, status, w.staff.email, note);
    if (!updated) return jsonError(404, "not_found", "Request not found.");
    await audit(w, `privacy.${status}`, reference, {});
    return privateJson({ ok: true });
  } catch (error) {
    return adminError(error);
  }
}
