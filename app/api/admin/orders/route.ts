import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { listOrders } from "@/lib/admin/ops";

const FULFILMENT = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "rto", "returned"];
const STATUS = ["pending_payment", "payment_failed", "expired", "confirmed", "needs_review"];

/** ADM-03 GET ?q=&fulfilment=&payment=cod|prepaid&status=&page= */
export async function GET(request: Request) {
  const auth = requireStaff(request, "orders.read");
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams;
  const pick = (k: string, allowed: string[]) => {
    const v = p.get(k);
    return v && allowed.includes(v) ? v : undefined;
  };
  try {
    return privateJson(
      await listOrders({
        q: (p.get("q") ?? "").slice(0, 40),
        fulfilment: pick("fulfilment", FULFILMENT),
        payment: pick("payment", ["cod", "prepaid"]),
        status: pick("status", STATUS),
        page: Number(p.get("page")) || 1,
      }),
    );
  } catch (error) {
    return adminError(error);
  }
}
