import { orderPayable } from "@/lib/orders/store";
import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { resolveOrders } from "@/lib/orders/store";

/** ADM-03 courier manifest: orders shipped on a day (IST) — GET ?date=YYYY-MM-DD */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "orders.ship");
  if (!auth.ok) return auth.response;
  const raw = new URL(request.url).searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  try {
    const orders = await resolveOrders().listRecent(5_000);
    const shipped = orders.filter((o) => o.timeline.some((t) => t.status === "shipped" && new Date(Date.parse(t.at) + 330 * 60_000).toISOString().slice(0, 10) === date));
    return privateJson({
      date,
      rows: shipped.map((o) => ({ orderNumber: o.number, awb: o.tracking?.awb ?? "", courier: o.tracking?.courier ?? "", city: o.address.city, pincode: o.address.pincode, cod: o.paymentMethod === "cod" ? orderPayable(o) : 0 /* only what wallet tenders didn't pay */, items: o.lines.reduce((n, l) => n + l.quantity, 0) })),
    });
  } catch (error) {
    return adminError(error);
  }
}
