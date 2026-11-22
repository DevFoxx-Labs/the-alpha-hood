import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { orderAdminView } from "@/lib/admin/ops";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { jsonError } from "@/lib/http/guard";

/** ADM-03 order detail (customer phone masked; the delivery address is needed to ship). */
export async function GET(request: Request, { params }: RouteContext<"/api/admin/orders/[number]">) {
  const auth = requireStaff(request, "orders.read");
  if (!auth.ok) return auth.response;
  const { number } = await params;
  if (!ORDER_NUMBER_RE.test(number)) return jsonError(404, "not_found", "Order not found.");
  try {
    const order = await orderAdminView(number);
    return order ? privateJson({ order }) : jsonError(404, "not_found", "Order not found.");
  } catch (error) {
    return adminError(error);
  }
}
