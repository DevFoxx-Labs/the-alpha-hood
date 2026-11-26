import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { resolveEmail } from "@/lib/notify/email";
import { deleteEmailProvider, updateEmailProvider } from "@/lib/providers/email-service";
import type { EmailProviderDoc } from "@/lib/providers/email-transport";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { asObject } from "@/lib/validation";

/**
 * PATCH → edit a provider (blank username / password = keep). Editing the LIVE provider needs a fresh authenticator
 * code and, when its connection changes, a passing test email (to `testTo`, else your own address) before saving.
 * DELETE → remove a provider that is not live.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/email-providers/[id]">) {
  const w = await adminWrite(request, "settings.manage", "email-provider", 8_192);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const store = resolveProviderStore();
    const row = await store.get<EmailProviderDoc>("email", id);
    if (row?.active) await stepUp(w.staff, asObject(w.body).code);
    const before = resolveEmail(); // the route that was live before the change carries the warning
    const change = await locks.run("admin:email-providers", () => updateEmailProvider(store, id, w.body, w.staff.id, w.staff.email));
    await recordChange(w, id, "update", change, "email", before);
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/admin/email-providers/[id]">) {
  const w = await adminWrite(request, "settings.manage", "email-provider", 256);
  if (!w.ok) return w.response;
  const { id } = await params;
  try {
    const done = await locks.run("admin:email-providers", () => deleteEmailProvider(resolveProviderStore(), id));
    await recordChange(w, id, "delete", { liveChanged: false, summary: done.summary }, "email");
    return privateJson({ ok: true });
  } catch (error) {
    return providerError(error);
  }
}
