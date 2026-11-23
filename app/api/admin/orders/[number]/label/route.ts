import { orderPayable } from "@/lib/orders/store";
import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { jsonError } from "@/lib/http/guard";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { resolveOrders } from "@/lib/orders/store";

/** ADM-03 shipping label data (after dispatch). Reveals the delivery phone, so each view is audited. */
export async function GET(request: Request, { params }: RouteContext<"/api/admin/orders/[number]/label">) {
  const auth = requireStaff(request, "orders.ship");
  if (!auth.ok) return auth.response;
  const { number } = await params;
  if (!ORDER_NUMBER_RE.test(number)) return jsonError(404, "not_found", "Order not found.");
  try {
    const o = await resolveOrders().get(number);
    if (!o) return jsonError(404, "not_found", "Order not found.");
    if (!o.tracking) return jsonError(409, "not_shipped", "Mark the order as shipped to create the label.");
    await audit(auth, "order.label_viewed", number);
    return privateJson({
      label: {
        orderNumber: o.number,
        courier: o.tracking.courier,
        awb: o.tracking.awb,
        // Collect only what wallet tenders (coins / gift card / credit) didn't pay (CHK-05).
        cod: o.paymentMethod === "cod" ? orderPayable(o) : 0,
        to: { name: o.address.name, phone: o.address.phone, line1: o.address.line1, line2: o.address.line2, landmark: o.address.landmark, city: o.address.city, state: o.address.state, pincode: o.address.pincode },
        from: { name: LEGAL_CONFIG.entityName, address: LEGAL_CONFIG.registeredAddress, phone: LEGAL_CONFIG.supportPhone },
        items: o.lines.reduce((n, l) => n + l.quantity, 0),
        invoice: o.invoice?.number ?? null,
      },
    });
  } catch (error) {
    return adminError(error);
  }
}
