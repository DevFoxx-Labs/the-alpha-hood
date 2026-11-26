import { audit, confirmTotp } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { resolveStaffStore, type Staff } from "@/lib/admin/staff";
import { PRIVATE_NO_STORE } from "@/lib/http/guard";
import { resolveEmail } from "@/lib/notify/email";
import { securityEvent } from "@/lib/security/log";
import { type Change, ProviderError } from "./sms-service";

/** Shared by the /api/admin/sms-providers routes: errors, step-up, audit and the owner alert. */
export function providerError(error: unknown): Response {
  if (error instanceof ProviderError) {
    return Response.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: PRIVATE_NO_STORE });
  }
  return adminError(error);
}

/** Changing who sends sign-in codes needs a fresh authenticator code, even inside a signed-in session. */
export const stepUp = (staff: Staff, code: unknown) => confirmTotp(staff, code);

/**
 * Records a provider change and, when the provider that sends sign-in codes changed, tells every owner by email
 * (best effort: until an email provider is connected this is the audit log + security log only).
 */
export async function recordChange(guard: { staff: Staff; ip: string }, id: string, action: string, change: Pick<Change, "liveChanged" | "summary">): Promise<void> {
  await audit(guard, `sms_provider.${action}`, `sms_provider:${id}`, { summary: change.summary.slice(0, 200), live: change.liveChanged });
  if (!change.liveChanged) return;
  securityEvent("sms_provider_changed", { staff: guard.staff.id, action, provider: id });
  try {
    const mailer = resolveEmail();
    if (!mailer.enabled) return;
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    const owners = (await resolveStaffStore().list()).filter((s) => s.role === "owner" && !s.disabled);
    await Promise.allSettled(
      owners.map((o) =>
        mailer.send({
          to: o.email,
          subject: "The Alpha Hood: the SMS provider was changed",
          text: [
            change.summary,
            "This provider sends every sign-in code and order SMS.",
            `Changed by ${guard.staff.name} on ${when} IST.`,
            "If you or your team did not do this, sign in now, open Admin → SMS providers, activate the right provider and change your password.",
          ].join("\n\n"),
        }),
      ),
    );
  } catch {
    // the change itself is already saved and audited
  }
}
