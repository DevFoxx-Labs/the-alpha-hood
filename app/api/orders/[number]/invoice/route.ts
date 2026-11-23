import { ORDER_NUMBER_RE } from "@/lib/checkout/parse";
import { clientIp, jsonError } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { LEGAL_CONFIG } from "@/lib/legal/config";
import { GST_CONFIG, isIntraState, splitTax } from "@/lib/pricing/gst";
import { resolveOrders } from "@/lib/orders/store";

/**
 * GET /api/orders/{number}/invoice — GST tax invoice data for the caller's own order (CHK-10, ACC-02).
 * Available once the order has shipped (the invoice is issued at dispatch). Seller facts come from config.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/orders/[number]/invoice">) {
  const rl = rateLimiter.hit(`invoice:ip:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  const { number } = await params;
  if (!ORDER_NUMBER_RE.test(number)) return jsonError(404, "order_not_found", "Order not found.");
  try {
    const o = await resolveOrders().get(number);
    if (!o || o.customerId !== auth.customerId) return jsonError(404, "order_not_found", "Order not found.");
    if (!o.invoice) return jsonError(409, "not_issued", "Your invoice is issued when the order ships.");
    const intra = isIntraState(o.address.state);
    return privateJson({
      invoice: {
        number: o.invoice.number,
        issuedAt: o.invoice.issuedAt,
        orderNumber: o.number,
        orderDate: o.createdAt,
        seller: { name: LEGAL_CONFIG.entityName, address: LEGAL_CONFIG.registeredAddress, gstin: LEGAL_CONFIG.gstin, state: GST_CONFIG.warehouseState },
        buyer: { name: o.address.name, address: [o.address.line1, o.address.line2, o.address.landmark].filter(Boolean).join(", "), city: o.address.city, state: o.address.state, pincode: o.address.pincode },
        placeOfSupply: o.address.state,
        lines: o.lines.map((l) => {
          const split = splitTax(l.gst, intra);
          return { title: l.title, size: l.size, quantity: l.quantity, gstRate: l.gstRate, taxable: l.net - l.gst, ...split, total: l.net };
        }),
        charges: { shipping: o.pricing.shipping, express: o.pricing.expressFee, cod: o.pricing.codFee },
        totals: { gst: o.pricing.gst, total: o.pricing.total },
        paidBy: o.tenders
          ? { coins: o.tenders.coins * 100, giftCard: o.tenders.giftCard?.amount ?? 0, storeCredit: o.tenders.storeCredit, balance: o.payable ?? o.pricing.total }
          : null,
        paymentMethod: o.paymentMethod,
      },
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
