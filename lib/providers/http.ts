import { audit, confirmTotp } from "@/lib/admin/auth";
import { adminError } from "@/lib/admin/http";
import { resolveStaffStore, type Staff } from "@/lib/admin/staff";
import { PRIVATE_NO_STORE } from "@/lib/http/guard";
import { resolveEmail } from "@/lib/notify/email";
import { securityEvent } from "@/lib/security/log";
import { ProviderError } from "./errors";

export interface Change {
  liveChanged: boolean;
  summary: string;
}

/** Shared by the /api/admin provider routes (SMS, email, storage): errors, step-up, audit and the owner alert. */
export function providerError(error: unknown): Response {
  if (error instanceof ProviderError) {
    return Response.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: PRIVATE_NO_STORE });
  }
  return adminError(error);
}

/** Changing who sends sign-in codes needs a fresh authenticator code, even inside a signed-in session. */
export const stepUp = (staff: Staff, code: unknown) => confirmTotp(staff, code);

export type ProviderArea = "sms" | "email" | "storage" | "shipping";
const AREA: Record<ProviderArea, { subject: string; what: string; page: string }> = {
  sms: { subject: "the SMS provider was changed", what: "This provider sends every sign-in code and order SMS.", page: "Admin → SMS providers" },
  email: { subject: "the email provider was changed", what: "This provider sends every store email, including staff password-reset codes.", page: "Admin → Email providers" },
  storage: { subject: "the file storage was changed", what: "New product and return photos are stored there from now on.", page: "Admin → Storage" },
  shipping: { subject: "the shipping (courier) account was changed", what: "This account answers every delivery check (pincode, delivery date, COD) on the store.", page: "Admin → Shipping" },
};

/**
 * Records a provider change in the audit log and, when what is live changed, tells every owner by email (best
 * effort: without an email provider it is the audit log + security log only). `mailer` lets the caller pass the
 * route that was live BEFORE the change (email), so someone who points mail at their own server can't also
 * swallow the warning about it.
 */
export async function recordChange(guard: { staff: Staff; ip: string }, id: string, action: string, change: Change, area: ProviderArea = "sms", mailer = resolveEmail()): Promise<void> {
  await audit(guard, `${area}_provider.${action}`, `${area}_provider:${id}`, { summary: change.summary.slice(0, 200), live: change.liveChanged });
  if (!change.liveChanged) return;
  securityEvent("provider_changed", { staff: guard.staff.id, area, action, provider: id });
  const a = AREA[area];
  try {
    if (!mailer.enabled) return;
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    const owners = (await resolveStaffStore().list()).filter((s) => s.role === "owner" && !s.disabled);
    await Promise.allSettled(
      owners.map((o) =>
        mailer.send({
          to: o.email,
          subject: `The Alpha Hood: ${a.subject}`,
          text: [
            change.summary,
            a.what,
            `Changed by ${guard.staff.name} on ${when} IST.`,
            `If you or your team did not do this, sign in now, open ${a.page}, put the right setting back and change your password.`,
          ].join("\n\n"),
        }),
      ),
    );
  } catch {
    // the change itself is already saved and audited
  }
}
