import { requireStaff } from "@/lib/admin/auth";
import { adminWrite, privateJson } from "@/lib/admin/http";
import { createEmailProvider, emailProvidersPayload } from "@/lib/providers/email-service";
import { providerError, recordChange } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";

/**
 * Admin → Email providers (owner only). GET → saved providers (username masked, password never) + SMTP presets.
 * POST `{ name, host, port, encryption, username, password, fromAddress, fromName, replyTo }` → a new, not-yet-live provider.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "settings.manage");
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await emailProvidersPayload(resolveProviderStore()));
  } catch (error) {
    return providerError(error);
  }
}

export async function POST(request: Request) {
  const w = await adminWrite(request, "settings.manage", "email-provider", 8_192);
  if (!w.ok) return w.response;
  try {
    const change = await createEmailProvider(resolveProviderStore(), w.body, w.staff.id);
    await recordChange(w, change.provider.id, "create", change, "email");
    return privateJson(change, { status: 201 });
  } catch (error) {
    return providerError(error);
  }
}
