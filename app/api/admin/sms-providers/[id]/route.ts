import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import type { SmsProviderDoc } from "@/lib/providers/sms-gateway";
import { deleteSmsProvider, updateSmsProvider } from "@/lib/providers/sms-service";
import { resolveProviderStore } from "@/lib/providers/store";
import { asObject } from "@/lib/validation";

/**
 * PATCH → edit a provider (blank key = keep). Editing the LIVE provider needs a fresh authenticator code and,
 * when its connection changes, a passing test SMS to `testTo` before anything is saved.
 * DELETE → remove a provider that is not live.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/sms-providers/[id]">) {
  const w = await adminWrite(request, "settings.manage", "sms-provider", 8_192);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const store = resolveProviderStore();
    const row = await store.get<SmsProviderDoc>("sms", id);
    if (row?.active) await stepUp(w.staff, asObject(w.body).code);
    const change = await locks.run("admin:sms-providers", () => updateSmsProvider(store, id, w.body, w.staff.id));
    await recordChange(w, id, "update", change);
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/admin/sms-providers/[id]">) {
  const w = await adminWrite(request, "settings.manage", "sms-provider", 256);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const done = await locks.run("admin:sms-providers", () => deleteSmsProvider(resolveProviderStore(), id));
    await recordChange(w, id, "delete", { liveChanged: false, summary: done.summary });
    return privateJson({ ok: true });
  } catch (error) {
    return providerError(error);
  }
}
