import { siteUrl } from "@/lib/seo/site";
import type { EmailMessage } from "./email";
import type { Template } from "./outbox";

/**
 * Plain-text customer emails, one fixed template per message type. Only allow-listed references are filled in, and
 * only after a shape check — no free text, names, addresses or order contents ever reach an email from the outbox.
 * Every email links to the account page, where customers change what they receive.
 */
const REF_RE = /^[A-Za-z0-9 ._/:,()-]{1,60}$/;

type Refs = Record<string, string>;
const order = (r: Refs) => `/account/orders/${encodeURIComponent(r.orderNumber ?? "")}`;
const product = (r: Refs) => `/products/${encodeURIComponent(r.handle ?? "")}`;

const T: Record<Template, { needs: string[]; subject: (r: Refs) => string; lines: (r: Refs) => string[]; link: (r: Refs) => string }> = {
  order_confirmed: { needs: ["orderNumber"], subject: (r) => `Order ${r.orderNumber} confirmed`, lines: (r) => [`Thank you — your order ${r.orderNumber} is confirmed.`, "We'll email you again when it ships."], link: order },
  order_packed: { needs: ["orderNumber"], subject: (r) => `Order ${r.orderNumber} is packed`, lines: (r) => [`Your order ${r.orderNumber} is packed and waiting for the courier.`], link: order },
  order_shipped: { needs: ["orderNumber"], subject: (r) => `Order ${r.orderNumber} has shipped`, lines: (r) => [`Your order ${r.orderNumber} is on its way.`, "Track it from your order page."], link: order },
  order_out_for_delivery: { needs: ["orderNumber"], subject: (r) => `Order ${r.orderNumber} is out for delivery`, lines: (r) => [`The courier is bringing your order ${r.orderNumber} today.`], link: order },
  order_delivered: { needs: ["orderNumber"], subject: (r) => `Order ${r.orderNumber} delivered`, lines: (r) => [`Your order ${r.orderNumber} was delivered.`, "Something not right? You can start a return from your order page."], link: order },
  order_cancelled: { needs: ["orderNumber"], subject: (r) => `Order ${r.orderNumber} cancelled`, lines: (r) => [`Your order ${r.orderNumber} was cancelled.`, "If you paid online, the refund details are on your order page."], link: order },
  refund_initiated: { needs: ["orderNumber"], subject: (r) => `Refund started for order ${r.orderNumber}`, lines: (r) => [`We've started a refund for order ${r.orderNumber}.`, "Banks usually take 5–7 working days to show it."], link: order },
  return_requested: { needs: ["orderNumber", "returnNumber"], subject: (r) => `Return ${r.returnNumber} received`, lines: (r) => [`We've received your return request ${r.returnNumber} for order ${r.orderNumber}.`], link: order },
  return_pickup_scheduled: { needs: ["orderNumber", "returnNumber"], subject: (r) => `Pickup scheduled for return ${r.returnNumber}`, lines: (r) => [`The courier will collect return ${r.returnNumber}. Keep the item packed with its tags.`], link: order },
  return_completed: { needs: ["orderNumber", "returnNumber"], subject: (r) => `Return ${r.returnNumber} completed`, lines: (r) => [`Your return ${r.returnNumber} passed our check and has been settled.`], link: order },
  return_rejected: { needs: ["orderNumber", "returnNumber"], subject: (r) => `Return ${r.returnNumber} update`, lines: (r) => [`Your return ${r.returnNumber} didn't pass our check. The reason is on your order page.`], link: order },
  review_request: { needs: ["orderNumber"], subject: () => "How did it fit?", lines: (r) => [`Tell other shoppers how your order ${r.orderNumber} fits — it takes a minute.`], link: (r) => `/account/reviews?order=${encodeURIComponent(r.orderNumber ?? "")}` },
  back_in_stock: { needs: ["handle"], subject: () => "It's back in stock", lines: (r) => [`Something you asked about is back${r.size ? ` in size ${r.size}` : ""}. Sizes go fast.`], link: product },
  price_drop: { needs: ["handle"], subject: () => "A price dropped", lines: () => ["Something you're watching just got cheaper."], link: product },
  abandoned_checkout_1h: { needs: [], subject: () => "Your bag is waiting", lines: () => ["You left something in your bag. It's saved for you."], link: () => "/bag" },
  abandoned_checkout_24h: { needs: [], subject: () => "Still thinking it over?", lines: () => ["Your bag is still saved. Sizes and stock can change."], link: () => "/bag" },
  review_published: { needs: ["handle"], subject: () => "Your review is live", lines: () => ["Thanks — your review passed our check and is now on the product page, with a “Verified buyer” badge."], link: product },
  review_rejected: { needs: [], subject: () => "About your review", lines: () => ["We couldn't publish your review as it is. The reason is in My reviews — edit it and we'll check it again."], link: () => "/account/reviews" },
  review_replied: { needs: ["handle"], subject: () => "We replied to your review", lines: () => ["We've posted a reply under your review."], link: product },
  feedback_answered: { needs: [], subject: () => "We replied to your message", lines: () => ["Our team has answered your message. Read the reply in your account."], link: () => "/account/help" },
  new_device_sign_in: {
    needs: ["device", "when"],
    subject: () => "New sign-in to your The Alpha Hood account",
    lines: (r) => [`Your account was signed in on ${r.device} on ${r.when} IST.`, "If this was you, there's nothing to do.", "If it wasn't, open Account → Settings and choose “Sign out everywhere”, then contact us."],
    link: () => "/account/settings",
  },
};

export class EmailTemplateError extends Error {}

/** The email for one queued message, or throws when a reference is missing or malformed. */
export function renderEmail(template: Template, refs: Refs, to: string): EmailMessage {
  const t = T[template];
  const safe: Refs = {};
  for (const [k, v] of Object.entries(refs)) if (REF_RE.test(v)) safe[k] = v;
  for (const k of t.needs) if (!safe[k]) throw new EmailTemplateError(`Missing ${k}`);
  const marketing = template.startsWith("abandoned_checkout");
  const text = [
    ...t.lines(safe),
    "",
    siteUrl(t.link(safe)),
    "",
    "— The Alpha Hood",
    "",
    marketing
      ? `You get these because you agreed to marketing emails. Stop them any time: ${siteUrl("/account/settings")}`
      : `Change what we send you: ${siteUrl("/account/settings")}`,
  ].join("\n");
  return { to, subject: t.subject(safe).slice(0, 200), text };
}
