import { loadCartView, publicCartView } from "@/lib/cart/service";
import { commerce } from "@/lib/commerce";
import { STORE_CONFIG } from "@/lib/config/store";
import { guardPublicWrite, jsonError } from "@/lib/http/guard";
import { cartIdFrom, commerceErrorResponse, privateJson, setCartCookie } from "@/lib/http/commerce-http";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/cart/lines `{ productId, size, quantity }` — add to bag. Creates the cart on first add.
 * Price is never accepted from the client (unknown fields are rejected).
 */
export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "cart-write", limit: 60, windowMs: 60_000, maxBytes: 512 });
  if (!guard.ok) return guard.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, ["productId", "size", "quantity"]);
    const { productId, size } = input;
    const quantity = input.quantity ?? 1;
    if (typeof productId !== "string" || !/^[a-z0-9_]{1,64}$/.test(productId)) return jsonError(422, "invalid_input", "Unknown product.");
    if (typeof size !== "string" || size.length > 12) return jsonError(422, "invalid_input", "Choose a size.");
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > STORE_CONFIG.maxQtyPerSku) {
      return jsonError(422, "invalid_input", `Quantity must be 1–${STORE_CONFIG.maxQtyPerSku}.`);
    }

    let cartId = cartIdFrom(request);
    if (!cartId || !(await commerce.cart.get(cartId))) cartId = (await commerce.cart.create()).id;
    await commerce.cart.addLine(cartId, { productId, size, quantity });
    const response = privateJson(publicCartView(await loadCartView(cartId)), { status: 201 });
    setCartCookie(response, cartId);
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
