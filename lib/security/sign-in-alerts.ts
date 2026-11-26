import { after } from "next/server";
import type { Staff } from "@/lib/admin/staff";
import { resolveEmail } from "@/lib/notify/email";
import { notify } from "@/lib/notify/outbox";
import { deviceLabel, signInTime } from "./devices";
import { securityEvent } from "./log";
import { securityPolicy } from "./policy";

/**
 * New-device sign-in alerts (Settings → Security switches them on/off; Notifications → Account → New-device
 * sign-in alert switches the email channel). Never blocks or fails a sign-in: errors are swallowed and logged.
 * Customers: queued in the outbox like any order message (sent by the next delivery run, to a verified email while
 * the policy asks for that). Staff: emailed after the response, straight to their work address.
 */
function later(task: () => Promise<unknown>) {
  try {
    after(() => task().catch(() => undefined));
  } catch {
    // outside a Next.js request (tests, scripts): run now
    void task().catch(() => undefined);
  }
}

export async function alertNewCustomerDevice(customerId: string, userAgent: string | null | undefined): Promise<void> {
  if (!securityPolicy().newDeviceAlertCustomers) return;
  securityEvent("new_device_sign_in", { customer: customerId });
  try {
    await notify(customerId, "new_device_sign_in", { device: deviceLabel(userAgent), when: signInTime() });
  } catch {
    // the sign-in itself must not fail because the alert couldn't be queued
  }
}

export async function alertNewStaffDevice(staff: Staff, userAgent: string | null | undefined, ip: string): Promise<void> {
  if (!securityPolicy().newDeviceAlertStaff) return;
  securityEvent("new_device_sign_in", { staff: staff.id });
  const mailer = resolveEmail();
  if (!mailer.enabled) return;
  const ipShown = /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "unknown";
  later(() =>
    mailer.send({
      to: staff.email,
      subject: "New sign-in to your The Alpha Hood admin account",
      text: [
        `Your admin account was signed in on ${deviceLabel(userAgent)} on ${signInTime()} IST (IP ${ipShown}).`,
        "",
        "If this was you, there's nothing to do.",
        "If it wasn't: ask an owner to reset your password and authenticator now (Admin → Staff), because whoever signed in had both your password and a code from your authenticator.",
      ].join("\n"),
    }),
  );
}
