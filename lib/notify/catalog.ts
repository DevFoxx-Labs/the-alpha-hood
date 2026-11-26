import type { Template } from "./outbox";

/**
 * Every customer message the store sends that the owner can switch per channel (Admin → Settings → Notifications),
 * like AstroGaon's NotificationCatalog. A channel missing from an event has no switch (it is never sent that way):
 * marketing and the new-device alert never go by SMS. WhatsApp has no provider yet, so it has no switch.
 * A customer's own choices (marketing consent, WhatsApp updates) still apply on top: an admin switch can only turn
 * a channel OFF, never send what the customer didn't agree to.
 */
export type NotifyChannel = "sms" | "email";
export const NOTIFY_CHANNELS: readonly NotifyChannel[] = ["sms", "email"];

export const NOTIFY_GROUPS = {
  orders: "Orders",
  returns: "Returns & refunds",
  alerts: "Alerts customers asked for",
  marketing: "Marketing (only with the customer's consent)",
  reviews: "Reviews & help",
  account: "Account",
} as const;
export type NotifyGroup = keyof typeof NOTIFY_GROUPS;

export interface NotifyEvent {
  group: NotifyGroup;
  label: string;
  description: string;
  /** channel → default (true = sent unless switched off). */
  channels: Partial<Record<NotifyChannel, boolean>>;
}

const both = { sms: true, email: true } as const;

export const NOTIFY_EVENTS: Record<Template, NotifyEvent> = {
  order_confirmed: { group: "orders", label: "Order confirmed", description: "Payment received or COD order accepted — with the order number.", channels: both },
  order_packed: { group: "orders", label: "Order packed", description: "The order is packed and waiting for the courier.", channels: { sms: false, email: true } },
  order_shipped: { group: "orders", label: "Order shipped", description: "Handed to the courier, with the tracking link.", channels: both },
  order_out_for_delivery: { group: "orders", label: "Out for delivery", description: "The courier is bringing it today.", channels: both },
  order_delivered: { group: "orders", label: "Order delivered", description: "Delivered — with the return window.", channels: both },
  order_cancelled: { group: "orders", label: "Order cancelled", description: "Cancelled by the customer or the store, with what happens to the payment.", channels: both },
  refund_initiated: { group: "returns", label: "Refund started", description: "A refund has been started for an order or a return.", channels: both },
  return_requested: { group: "returns", label: "Return requested", description: "The customer's return request was received.", channels: both },
  return_pickup_scheduled: { group: "returns", label: "Return pickup scheduled", description: "The courier will collect the return.", channels: both },
  return_completed: { group: "returns", label: "Return completed", description: "The returned item passed the check and was settled.", channels: both },
  return_rejected: { group: "returns", label: "Return rejected", description: "The returned item did not pass the check, with the reason.", channels: both },
  review_request: { group: "alerts", label: "Review request", description: "Asks for a review a few days after delivery.", channels: { sms: false, email: true } },
  back_in_stock: { group: "alerts", label: "Back in stock", description: "A size the customer asked to be told about is back.", channels: both },
  price_drop: { group: "alerts", label: "Price drop", description: "A product the customer is watching got cheaper.", channels: { sms: false, email: true } },
  abandoned_checkout_1h: { group: "marketing", label: "Cart reminder (1 hour)", description: "Only to customers who agreed to marketing email. Max 1 a day, 3 a week.", channels: { email: true } },
  abandoned_checkout_24h: { group: "marketing", label: "Cart reminder (24 hours)", description: "Only to customers who agreed to marketing email. Max 1 a day, 3 a week.", channels: { email: true } },
  review_published: { group: "reviews", label: "Review published", description: "The customer's review passed the check and is live on the product page.", channels: { email: true } },
  review_rejected: { group: "reviews", label: "Review not published", description: "The review wasn't published — with the reason, so they can edit it.", channels: { email: true } },
  review_replied: { group: "reviews", label: "Store replied to a review", description: "We posted a public reply under the customer's review.", channels: { email: true } },
  feedback_answered: { group: "reviews", label: "Help & feedback answered", description: "Support replied to the customer's message; the reply is in their account.", channels: { email: true } },
  new_device_sign_in: { group: "account", label: "New-device sign-in alert", description: "Security alert when an account signs in on a phone or browser it hasn't used before. Also needs Security → New-device alert.", channels: { email: true } },
};

/** Sent no matter what — switching them off would lock people out or hide a security problem. */
export const NOTIFY_ALWAYS_ON = [
  { label: "Sign-in codes (SMS)", description: "The one-time code customers sign in with." },
  { label: "Email verification codes", description: "The code that confirms a customer owns their email address." },
  { label: "Staff password-reset codes", description: "The code a staff member asks for on “Forgot password?”." },
  { label: "Staff “password changed” notice", description: "Security notice after a staff password is changed." },
  { label: "Provider-change alerts to owners", description: "When the SMS, email or storage provider is changed." },
] as const;

export type NotifySwitches = Partial<Record<Template, Partial<Record<NotifyChannel, boolean>>>>;

export function hasNotifyChannel(event: Template, channel: string): channel is NotifyChannel {
  return Object.hasOwn(NOTIFY_EVENTS, event) && Object.hasOwn(NOTIFY_EVENTS[event].channels, channel);
}

/** Saved value, else the catalogue default; a channel without a switch is never allowed. */
export function allowsWith(switches: NotifySwitches, event: Template, channel: string): boolean {
  if (!hasNotifyChannel(event, channel)) return false;
  return switches[event]?.[channel] ?? NOTIFY_EVENTS[event].channels[channel]!;
}

/** Only catalogued events and their channels, as booleans — anything else in the input is dropped. */
export function cleanSwitches(input: unknown): NotifySwitches {
  const out: NotifySwitches = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const event of Object.keys(NOTIFY_EVENTS) as Template[]) {
    const row = (input as Record<string, unknown>)[event];
    if (!row || typeof row !== "object") continue;
    for (const ch of NOTIFY_CHANNELS) {
      const v = (row as Record<string, unknown>)[ch];
      if (hasNotifyChannel(event, ch) && typeof v === "boolean") (out[event] ??= {})[ch] = v;
    }
  }
  return out;
}
