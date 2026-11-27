import { requireStaff } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { SHIPPING_ID, type ShippingDoc } from "@/lib/shipping/runtime";
import { saveShipping, shippingPayload } from "@/lib/shipping/service";
import { asObject } from "@/lib/validation";

/**
 * Admin → Shipping (owner only). GET: what answers delivery checks and the saved Shiprocket settings (password never
 * returned). PUT `{ email, password, pickupPincode, weightKg, code? }` — blank password = keep; changing the LIVE
 * account needs a fresh authenticator code and a passing live test before anything is saved.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "settings.manage");
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await shippingPayload(resolveProviderStore()));
  } catch (error) {
    return providerError(error);
  }
}

export async function PUT(request: Request) {
  const w = await adminWrite(request, "settings.manage", "shipping", 2_048);
  if (!w.ok) return w.response;
  try {
    const store = resolveProviderStore();
    if ((await store.get<ShippingDoc>("shipping", SHIPPING_ID))?.active) await stepUp(w.staff, asObject(w.body).code);
    const change = await locks.run("admin:shipping", () => saveShipping(store, w.body, w.staff.id));
    await recordChange(w, "shiprocket", "update", change, "shipping");
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}
