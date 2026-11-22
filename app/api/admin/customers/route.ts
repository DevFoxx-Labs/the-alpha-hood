import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { customerRow } from "@/lib/admin/ops";
import { resolveCustomers } from "@/lib/customers/store";

/** ADM-06 GET ?q= (last 4+ phone digits, name, email). Results are masked. */
export async function GET(request: Request) {
  const auth = requireStaff(request, "customers.read");
  if (!auth.ok) return auth.response;
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80);
  try {
    return privateJson({ rows: (await resolveCustomers().search(q, 50)).map(customerRow) });
  } catch (error) {
    return adminError(error);
  }
}
