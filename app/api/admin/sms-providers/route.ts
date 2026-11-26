import { requireStaff } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { providerError, recordChange } from "@/lib/providers/http";
import { createSmsProvider, smsProvidersPayload } from "@/lib/providers/sms-service";
import { resolveProviderStore } from "@/lib/providers/store";

/**
 * Admin → SMS providers (owner only). GET → saved providers (keys masked) + the driver catalogue.
 * POST `{ name, driver, credentials, senderId, otpTemplate, templates }` → a new, not-yet-live provider.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "settings.manage");
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await smsProvidersPayload(resolveProviderStore()));
  } catch (error) {
    return providerError(error);
  }
}

export async function POST(request: Request) {
  const w = await adminWrite(request, "settings.manage", "sms-provider", 8_192);
  if (!w.ok) return w.response;
  try {
    const change = await createSmsProvider(resolveProviderStore(), w.body, w.staff.id);
    await recordChange(w, change.provider.id, "create", change);
    return privateJson(change, { status: 201 });
  } catch (error) {
    return providerError(error);
  }
}
