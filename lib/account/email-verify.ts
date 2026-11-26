import { sha256 } from "@/lib/auth/secrets";
import { type OtpStore, resolveOtpStore, sendOtp, verifyOtp } from "@/lib/auth/otp";
import { type CustomerStore, resolveCustomers } from "@/lib/customers/store";
import { ValidationError } from "@/lib/http/guard";
import { type EmailAdapter, resolveEmail } from "@/lib/notify/email";

/**
 * Customer email verification (Admin → Settings → Security → "Send emails only to verified addresses").
 * A 6-digit code is emailed to the address on the account; entering it marks THAT address verified.
 * - Same code rules as sign-in: 5 minutes, 5 tries, single use, 30 s cooldown, hourly and daily caps, HMAC-stored.
 * - The code's purpose is "email-verify" and its key is derived from customer + address: it can't sign anyone in,
 *   can't verify another customer, and stops working if the email is changed before it is entered.
 */
export const EMAIL_VERIFY_PURPOSE = "email-verify";
const keyFor = (customerId: string, email: string) => `ev${sha256(`email-verify:${customerId}:${email}`).slice(0, 14)}`;

export class EmailVerifyError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "EmailVerifyError";
  }
}

export interface Deps {
  customers?: CustomerStore;
  otp?: OtpStore;
  mailer?: EmailAdapter;
  now?: number;
}

export async function sendEmailCode(customerId: string, deps: Deps = {}) {
  const customers = deps.customers ?? resolveCustomers();
  const mailer = deps.mailer ?? resolveEmail();
  const customer = await customers.get(customerId);
  if (!customer?.email) throw new EmailVerifyError(409, "no_email", "Add an email address first.");
  if (customer.emailVerified) throw new EmailVerifyError(409, "already_verified", "This email address is already verified.");
  if (!mailer.enabled) throw new EmailVerifyError(503, "email_unavailable", "We can't send emails right now. Try again later.");
  const to = customer.email;
  return sendOtp(keyFor(customerId, to), {
    store: deps.otp ?? resolveOtpStore(),
    now: deps.now,
    purpose: EMAIL_VERIFY_PURPOSE,
    deliver: (code) =>
      mailer.send(
        {
          to,
          subject: "Confirm your email for The Alpha Hood",
          text: [`Your code to confirm this email address is ${code}.`, "", "It works once and expires in 5 minutes. Never share it — we will never ask for it.", "", "Didn't ask for this? Ignore this email."].join("\n"),
        },
        { demoCode: code },
      ),
  });
}

export async function confirmEmailCode(customerId: string, challengeId: unknown, code: unknown, deps: Deps = {}): Promise<void> {
  if (typeof challengeId !== "string" || !/^[A-Za-z0-9_-]{16,40}$/.test(challengeId) || typeof code !== "string") throw new ValidationError("That code is incorrect or has expired.");
  const customers = deps.customers ?? resolveCustomers();
  const customer = await customers.get(customerId);
  if (!customer?.email) throw new EmailVerifyError(409, "no_email", "Add an email address first.");
  const key = await verifyOtp(challengeId, code.trim(), { store: deps.otp ?? resolveOtpStore(), now: deps.now, purpose: EMAIL_VERIFY_PURPOSE });
  // The code belongs to exactly this customer AND this address (another customer's code, or an old address, fails).
  if (key !== keyFor(customerId, customer.email)) throw new ValidationError("That code is incorrect or has expired.");
  await customers.setEmail(customerId, customer.email, true);
}
