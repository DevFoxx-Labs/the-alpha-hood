import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { maskPhone } from "@/lib/admin/ops";
import { resolveInbox } from "@/lib/privacy/requests";

/** DPDP rights / grievance inbox (privacy.read). Contacts masked in the list. */
export async function GET(request: Request) {
  const auth = requireStaff(request, "privacy.read");
  if (!auth.ok) return auth.response;
  try {
    const rows = (await resolveInbox().list()).map((r) => ({
      reference: r.reference,
      type: r.type,
      name: r.name,
      contact: r.contactKind === "phone" ? maskPhone(r.contact) : r.contact.replace(/^(.{2}).*(@.*)$/, "$1•••$2"),
      orderNumber: r.orderNumber,
      details: r.details,
      nominee: r.nominee ? { name: r.nominee.name } : null,
      status: r.status,
      createdAt: r.createdAt,
      acknowledgeBy: r.acknowledgeBy,
      resolveBy: r.resolveBy,
      log: r.log ?? [],
    }));
    return privateJson({ rows });
  } catch (error) {
    return adminError(error);
  }
}
