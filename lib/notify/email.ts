import { mockPaymentsAllowed } from "@/lib/checkout/flags";
import { BackendUnavailableError, type Env } from "@/lib/mock-guard";

/**
 * Transactional email (staff password-reset codes and "your password was changed" notices for now).
 *
 * Plain-text bodies built from fixed templates only. No HTML, so nothing user-supplied can inject markup or links.
 * Providers implement `EmailAdapter` and are chosen by `EMAIL_PROVIDER`. A factory returns null when its config is
 * incomplete (fail closed).
 *
 * The demo provider sends nothing. It records messages in memory and hands a code back so the developer can see it
 * on screen. It is refused on the live store (same rule as the demo SMS / payment gateway).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export class EmailError extends Error {
  constructor(
    public readonly code: "not_configured" | "invalid" | "rejected" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

export interface EmailAdapter {
  readonly name: string;
  /** True when this adapter really delivers mail (false for the "disabled" adapter). */
  readonly enabled: boolean;
  send(message: EmailMessage, opts?: { demoCode?: string }): Promise<{ providerId: string; demoCode?: string }>;
}

const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[A-Za-z]{2,24}$/;
const SAFE_LINE = /^[^\r\n]{1,200}$/;

/** Rejects header injection and absurd sizes before any provider sees the message. */
export function checkMessage(m: EmailMessage): EmailMessage {
  if (!EMAIL_RE.test(m.to) || !SAFE_LINE.test(m.subject) || m.text.length > 10_000) throw new EmailError("invalid", "Bad email message");
  return m;
}

export interface DemoEmail extends EmailAdapter {
  sent: EmailMessage[];
}

export function createDemoEmail(): DemoEmail {
  const sent: EmailMessage[] = [];
  let n = 0;
  return {
    name: "demo",
    enabled: true,
    sent,
    async send(message, opts) {
      sent.push(checkMessage(message));
      return { providerId: `demo_${++n}`, ...(opts?.demoCode ? { demoCode: opts.demoCode } : {}) };
    },
  };
}

const g = globalThis as unknown as { __alpha_hood_demo_email?: DemoEmail };

/**
 * Real providers, by `EMAIL_PROVIDER`. Empty until the owner picks a provider and its API contract is confirmed
 * from first-party docs (docs/owner-todo.md). Each factory returns null when its configuration is incomplete.
 */
export const EMAIL_PROVIDERS: Record<string, (env: Env) => EmailAdapter | null> = {};

/**
 * The provider made live in Admin → Email providers (lib/providers/email-runtime.ts installs it). It wins over the
 * environment's EMAIL_PROVIDER. Kept on globalThis so every route bundle of this process sees the same one.
 */
const live = globalThis as unknown as { __alpha_hood_active_email?: EmailAdapter | null };
export function setActiveEmail(adapter: EmailAdapter | null): void {
  live.__alpha_hood_active_email = adapter;
}
export const activeEmail = (): EmailAdapter | null => live.__alpha_hood_active_email ?? null;

export function resolveEmail(env: Env = process.env): EmailAdapter {
  // Only for the real process environment: tests and scripts that pass their own `env` get exactly what it says.
  if (env === process.env && live.__alpha_hood_active_email) return live.__alpha_hood_active_email;
  const factory = env.EMAIL_PROVIDER ? EMAIL_PROVIDERS[env.EMAIL_PROVIDER] : undefined;
  const real = factory?.(env);
  if (real) return real;
  if (!env.EMAIL_PROVIDER && mockPaymentsAllowed(env)) return (g.__alpha_hood_demo_email ??= createDemoEmail());
  return {
    name: "disabled",
    enabled: false,
    send: async () => {
      throw new BackendUnavailableError("Email");
    },
  };
}
