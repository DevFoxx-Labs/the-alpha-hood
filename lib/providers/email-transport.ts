import nodemailer from "nodemailer";
import { checkMessage, type EmailAdapter, EmailError, type EmailMessage } from "@/lib/notify/email";
import type { SmtpEncryption } from "./email-catalog";
import { publicAddress, type Resolver, UnsafeHostError } from "./net-guard";

/**
 * Sends one email through a saved SMTP provider (nodemailer).
 * - The host is checked on every send (public addresses only) and the connection goes to that checked address,
 *   while TLS verifies the certificate for the host name (SNI) — no SSRF, no DNS rebinding.
 * - TLS always: STARTTLS required on `tls`, implicit TLS on `ssl`; certificates checked; TLS 1.2+.
 * - 10 s connect / greeting, 20 s socket timeout. File and URL access in messages are switched off.
 * - Errors are scrubbed of the username and password before anyone sees them.
 */
export interface EmailProviderDoc {
  name: string;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  replyTo: string | null;
  lastTest: { ok: boolean; at: string; message: string } | null;
  activatedAt: string | null;
  createdAt: string;
  updatedBy: string;
}

export interface SendDeps {
  resolve?: Resolver;
  /** Tests: replaces nodemailer's transport factory. */
  createTransport?: typeof nodemailer.createTransport;
}

function scrub(message: string, doc: EmailProviderDoc): string {
  let out = message;
  for (const secret of [doc.password, doc.username]) if (secret && secret.length >= 4) out = out.split(secret).join("••••");
  return out.replace(/[\r\n]+/g, " ").slice(0, 300);
}

export async function sendThrough(doc: EmailProviderDoc, message: EmailMessage, deps: SendDeps = {}): Promise<string> {
  const m = checkMessage(message);
  let ip: string;
  try {
    ip = await publicAddress(doc.host, deps.resolve);
  } catch (e) {
    throw new EmailError("rejected", e instanceof UnsafeHostError ? e.message : "The mail host could not be checked.");
  }
  const transport = (deps.createTransport ?? nodemailer.createTransport)({
    host: ip,
    port: doc.port,
    secure: doc.encryption === "ssl",
    requireTLS: doc.encryption === "tls",
    ignoreTLS: false,
    auth: { user: doc.username, pass: doc.password },
    tls: { servername: doc.host, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    name: "the-alpha-hood",
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const info = await transport.sendMail({
      from: { name: doc.fromName, address: doc.fromAddress },
      to: m.to,
      subject: m.subject,
      text: m.text,
      ...(doc.replyTo ? { replyTo: doc.replyTo } : {}),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return String(info.messageId ?? "sent").slice(0, 120);
  } catch (e) {
    const code = (e as { responseCode?: number }).responseCode;
    const raw = e instanceof Error ? e.message : "Sending failed.";
    // SMTP: 5xx is permanent (bad login, refused sender) — retrying won't help; 4xx and network errors are temporary.
    throw new EmailError(code && code >= 500 ? "rejected" : "unavailable", scrub(raw, doc));
  } finally {
    transport.close();
  }
}

/** The live provider as the adapter the rest of the store already uses (lib/notify/email.ts). */
export function emailAdapterFor(doc: EmailProviderDoc, deps: SendDeps = {}): EmailAdapter {
  return {
    name: "smtp",
    enabled: true,
    async send(message) {
      return { providerId: await sendThrough(doc, message, deps) };
    },
  };
}
