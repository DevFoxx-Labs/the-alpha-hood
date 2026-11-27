import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { activateShipping } from "@/lib/shipping/service";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST /api/admin/shipping/active `{ choice: "shiprocket" | "off", code }` — needs a fresh authenticator code and, to go live, a passed test. */
export async function POST(request: Request) {
  const w = await adminWrite(request, "settings.manage", "shipping-active", 128);
  if (!w.ok) return w.response;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["choice", "code"]);
    await stepUp(w.staff, input.code);
    const change = await locks.run("admin:shipping", () => activateShipping(resolveProviderStore(), input.choice, w.staff.id));
    await recordChange(w, "shiprocket", "activate", change, "shipping");
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}
