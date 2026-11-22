import { loadCartView, publicCartView } from "@/lib/cart/service";
import { commerce } from "@/lib/commerce";
import { STORE_CONFIG } from "@/lib/config/store";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { cartIdFrom, commerceErrorResponse, privateJson } from "@/lib/http/commerce-http";
import { asObject, rejectUnknownFields } from "@/lib/validation";

const LINE_RE = /^line_[a-f0-9]{32}$/;

/**
 * PATCH `{ size?, quantity? }` / DELETE `{}` a line of the caller's own bag. The cart comes from the
 * HttpOnly cookie only, so a line id from another cart simply isn't found (404).
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/cart/lines/[lineId]">) {
  const guard = await guardPublicWrite(request, { name: "cart-write", limit: 60, windowMs: 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  const { lineId } = await params;
  const cartId = cartIdFrom(request);
  if (!cartId || !LINE_RE.test(lineId)) return jsonError(404, "not_found", "Item not found.");
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["size", "quantity"]);
    const patch: { size?: string; quantity?: number } = {};
    if (input.size !== undefined) {
      if (typeof input.size !== "string" || input.size.length > 12) return jsonError(422, "invalid_input", "Choose a size.");
      patch.size = input.size;
    }
    if (input.quantity !== undefined) {
      const q = input.quantity;
      if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > STORE_CONFIG.maxQtyPerSku) {
        return jsonError(422, "invalid_input", `Quantity must be 1–${STORE_CONFIG.maxQtyPerSku}.`);
      }
      patch.quantity = q;
    }
    await commerce.cart.updateLine(cartId, lineId, patch);
    return privateJson(publicCartView(await loadCartView(cartId)));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/cart/lines/[lineId]">) {
  const guard = await guardPublicWrite(request, { name: "cart-write", limit: 60, windowMs: 60_000, maxBytes: 64 });
  if (!guard.ok) return guard.response;
  const { lineId } = await params;
  const cartId = cartIdFrom(request);
  if (!cartId || !LINE_RE.test(lineId)) return jsonError(404, "not_found", "Item not found.");
  try {
    await commerce.cart.removeLine(cartId, lineId);
    return privateJson(publicCartView(await loadCartView(cartId)));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
