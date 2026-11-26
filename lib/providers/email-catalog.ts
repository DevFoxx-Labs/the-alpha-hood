/**
 * What the owner can choose in Admin → Email providers. SMTP only — every mainstream provider offers it, including
 * Amazon SES (preset below). Presets only pre-fill host / port / encryption / username; nothing here is fetched.
 * Plain-text SMTP is never offered: `tls` = STARTTLS required, `ssl` = implicit TLS. Certificates are always checked.
 */
export const SMTP_PORTS = [25, 465, 587, 2525] as const;
export const SMTP_ENCRYPTIONS = ["tls", "ssl"] as const;
export type SmtpEncryption = (typeof SMTP_ENCRYPTIONS)[number];

export interface SmtpPreset {
  key: string;
  label: string;
  host: string;
  port: (typeof SMTP_PORTS)[number];
  encryption: SmtpEncryption;
  username: string | null;
  help: string;
}

export const SMTP_PRESETS: readonly SmtpPreset[] = [
  { key: "zoho", label: "Zoho Mail (India)", host: "smtp.zoho.in", port: 465, encryption: "ssl", username: null, help: "Use the mailbox address and an app-specific password." },
  { key: "zeptomail", label: "Zoho ZeptoMail (India)", host: "smtp.zeptomail.in", port: 587, encryption: "tls", username: "emailapikey", help: 'Username is "emailapikey"; the password is a Send Mail token from ZeptoMail → Mail Agents → SMTP.' },
  { key: "google", label: "Google Workspace / Gmail", host: "smtp.gmail.com", port: 587, encryption: "tls", username: null, help: "Turn on 2-Step Verification and use an App Password, not the account password." },
  { key: "microsoft", label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, encryption: "tls", username: null, help: "SMTP AUTH must be enabled for the mailbox in Microsoft 365." },
  { key: "hostinger", label: "Hostinger Email", host: "smtp.hostinger.com", port: 465, encryption: "ssl", username: null, help: "Use the mailbox address and its password." },
  { key: "ses", label: "Amazon SES (Mumbai)", host: "email-smtp.ap-south-1.amazonaws.com", port: 587, encryption: "tls", username: null, help: "Use SES SMTP credentials (SES → SMTP settings), not your AWS access keys." },
  { key: "brevo", label: "Brevo (Sendinblue)", host: "smtp-relay.brevo.com", port: 587, encryption: "tls", username: null, help: "Use the SMTP login and SMTP key from Brevo → SMTP & API." },
  { key: "sendgrid", label: "SendGrid", host: "smtp.sendgrid.net", port: 587, encryption: "tls", username: "apikey", help: 'Username is the word "apikey"; the password is a SendGrid API key with Mail Send access.' },
  { key: "mailgun", label: "Mailgun", host: "smtp.mailgun.org", port: 587, encryption: "tls", username: null, help: "Use the SMTP credentials of your Mailgun sending domain." },
  { key: "postmark", label: "Postmark", host: "smtp.postmarkapp.com", port: 587, encryption: "tls", username: null, help: "Use a Server API token as both username and password." },
  { key: "resend", label: "Resend", host: "smtp.resend.com", port: 465, encryption: "ssl", username: "resend", help: 'Username is "resend"; the password is a Resend API key.' },
  { key: "custom", label: "Other SMTP server", host: "", port: 587, encryption: "tls", username: null, help: "Use the SMTP settings your provider gives you." },
];

export function emailCatalogPayload() {
  return {
    ports: [...SMTP_PORTS],
    encryptions: [
      { value: "tls", label: "STARTTLS (usually port 587)" },
      { value: "ssl", label: "SSL/TLS (usually port 465)" },
    ],
    presets: SMTP_PRESETS.map((p) => ({ ...p })),
  };
}
export type EmailCatalogPayload = ReturnType<typeof emailCatalogPayload>;
