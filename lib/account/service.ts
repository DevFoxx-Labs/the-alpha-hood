import { revokeAllSessions } from "@/lib/auth/session";
import { defaultDeps } from "@/lib/checkout/service";
import { commerce } from "@/lib/commerce";
import type { ConsentLedger, ConsentRecord } from "@/lib/consent/ledger";
import { resolveLedger } from "@/lib/consent/ledger";
import type { CommunicationPurpose } from "@/lib/consent/purposes";
import { nextStatus, publicHistory, type RequestContext } from "@/lib/consent/service";
import { noticeVersion } from "@/lib/legal";
import { canCustomerCancel, capturedAmount, refundedAmount } from "@/lib/orders/lifecycle";
import type { Order } from "@/lib/orders/store";
import { resolvePhotos } from "@/lib/returns/photos";
import { returnEligibility } from "@/lib/returns/rules";
import { publicReturn, resolveReturns, type ReturnDeps, type ReturnRequest } from "@/lib/returns/service";
import { resolveCredit } from "@/lib/wallet/store-credit";
import { resolveLoyalty } from "@/lib/loyalty/store";
import { resolveAlerts } from "@/lib/alerts/service";
import { resolveUgc } from "@/lib/ugc/service";

/** Builds return deps with catalogue lookups prefetched for the given products. */
export async function returnDeps(productIds: string[]): Promise<ReturnDeps> {
  const products = new Map<string, Awaited<ReturnType<typeof commerce.getProductById>>>();
  for (const id of new Set(productIds)) products.set(id, await commerce.getProductById(id));
  return {
    ...defaultDeps(),
    returns: resolveReturns(),
    credit: resolveCredit(),
    photos: resolvePhotos(),
    categoryOf: (id) => products.get(id)?.category,
    sizesOf: (id) => products.get(id)?.sizes.filter((s) => s.stock > 0).map((s) => s.label) ?? [],
  };
}

/** Customer-facing order detail (ORD-01 timeline, ORD-04 cancel, RET-01 eligibility). */
export function orderDetail(o: Order, returns: ReturnRequest[], deps: Pick<ReturnDeps, "categoryOf" | "sizesOf">, now = new Date()) {
  const elig = returnEligibility(o, deps.categoryOf, now);
  return {
    number: o.number,
    status: o.status,
    fulfilment: o.fulfilment,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentMethod === "cod" ? "cod" : (o.attempts.at(-1)?.status ?? "pending"),
    canRetryPayment: o.paymentMethod !== "cod" && (o.status === "payment_failed" || o.status === "expired"),
    canCancel: canCustomerCancel(o),
    timeline: o.timeline,
    tracking: o.tracking,
    invoice: o.invoice ? { number: o.invoice.number } : null,
    lines: o.lines.map((l) => {
      const e = elig.lines.find((x) => x.lineId === l.lineId);
      return {
        lineId: l.lineId,
        title: l.title,
        handle: l.handle,
        colour: l.colour,
        size: l.size,
        quantity: l.quantity,
        image: l.image,
        net: l.net,
        returnableQty: e?.returnableQty ?? 0,
        returnNote: e?.reason ?? null,
        exchangeSizes: deps.sizesOf(l.productId).filter((s) => s !== l.size),
      };
    }),
    returnWindow: { open: elig.open, closesAt: elig.closesAt, reason: elig.reason },
    returns: returns.map(publicReturn),
    refunds: o.refunds.map((r) => ({ amount: r.amount, to: r.to, status: r.status, createdAt: r.createdAt })),
    totals: {
      mrpTotal: o.pricing.mrpTotal,
      savings: o.pricing.savings,
      shipping: o.pricing.shipping,
      codFee: o.pricing.codFee,
      expressFee: o.pricing.expressFee,
      total: o.pricing.total,
      gst: o.pricing.gst.total,
      paid: capturedAmount(o),
      refunded: refundedAmount(o),
    },
    delivery: o.delivery,
    deliveredAt: o.deliveredAt,
    address: { name: o.address.name, line1: o.address.line1, city: o.address.city, state: o.address.state, pincode: o.address.pincode },
    createdAt: o.createdAt,
  };
}

// ── Marketing preferences ↔ consent ledger (DPDP rule §4: toggles stay in sync with the ledger) ──

/** Settings toggles: two marketing purposes and the transactional WhatsApp opt-in (ORD-02). */
export type PreferencePurpose = CommunicationPurpose | "whatsapp_updates";
export const MARKETING_PURPOSES: PreferencePurpose[] = ["marketing_email", "marketing_whatsapp", "whatsapp_updates"];

function latest(rows: ConsentRecord[], purpose: string) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].purpose === purpose) return rows[i].status;
  return undefined;
}

export async function getPreferences(customerId: string, ledger: ConsentLedger = resolveLedger()) {
  const rows = await ledger.listByUser(customerId);
  return {
    marketing_email: latest(rows, "marketing_email") === "granted",
    marketing_whatsapp: latest(rows, "marketing_whatsapp") === "granted",
    whatsapp_updates: latest(rows, "whatsapp_updates") === "granted",
    history: publicHistory(rows),
  };
}

/** Writes a ledger row for every purpose whose value changed (granted / withdrawn / denied). */
export async function setPreferences(
  customerId: string,
  wanted: Partial<Record<PreferencePurpose, boolean>>,
  ctx: RequestContext,
  ledger: ConsentLedger = resolveLedger(),
  now = new Date(),
) {
  const rows = await ledger.listByUser(customerId);
  const changes = MARKETING_PURPOSES.filter((p) => wanted[p] !== undefined && (latest(rows, p) === "granted") !== wanted[p]);
  if (changes.length) {
    await ledger.append(
      changes.map((purpose) => ({
        user_id: customerId,
        visitor_id: null,
        subscriber_id: null,
        purpose,
        status: nextStatus(latest(rows, purpose), wanted[purpose]!),
        method: "preferences" as const,
        source: ctx.source,
        notice_version: noticeVersion(["privacy"]),
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      })),
      now,
    );
  }
  return getPreferences(customerId, ledger);
}

// ── DPDP rights: access / export and erasure ──────────────────────────────────────────────────────

export async function exportData(customerId: string) {
  const deps = defaultDeps();
  const customer = await deps.customers.get(customerId);
  if (!customer) return null;
  const orders = await deps.orders.listByCustomer(customerId);
  const returns = await resolveReturns().listByCustomer(customerId);
  const credit = resolveCredit();
  return {
    generatedAt: new Date().toISOString(),
    note: "Your personal data held by The Alpha Hood (DPDP Act 2023, s.11). Payment card / UPI details are held by our payment partner, not us.",
    profile: { phone: customer.phone, name: customer.name, email: customer.email, createdAt: customer.createdAt },
    addresses: customer.addresses,
    orders: orders.map((o) => ({
      number: o.number,
      createdAt: o.createdAt,
      status: o.status,
      fulfilment: o.fulfilment,
      items: o.lines.map((l) => ({ title: l.title, size: l.size, quantity: l.quantity, paid: l.net })),
      total: o.pricing.total,
      paymentMethod: o.paymentMethod,
      deliveryAddress: o.address,
      refunds: o.refunds.map((r) => ({ amount: r.amount, to: r.to, status: r.status, createdAt: r.createdAt })),
    })),
    returns: returns.map(publicReturn),
    storeCredit: { balance: await credit.balance(customerId), history: await credit.history(customerId) },
    consents: (await getPreferences(customerId)).history,
    sharedWith: [
      "Payment partner (payments and refunds)",
      "Courier partners (delivery address and phone for delivery and pickups)",
      "SMS / email providers (order updates; offers only if you opted in)",
    ],
  };
}

export class AccountError extends Error {
  constructor(public readonly code: "orders_in_progress", message: string) {
    super(message);
  }
}

/**
 * DPDP erasure (ACC-02 "delete account"). Refused while an order or return is still in progress (we need
 * your address to deliver / pick up). Erases profile, email, addresses and sessions, withdraws every consent
 * (ledger rows are kept as proof, as the Privacy Notice states), and keeps order/invoice records the tax law
 * requires — with the customer link anonymised.
 */
export async function deleteAccount(customerId: string, ctx: RequestContext, now = new Date()) {
  const deps = defaultDeps();
  const orders = await deps.orders.listByCustomer(customerId);
  const busy = orders.some((o) => o.status === "pending_payment" || (o.status === "confirmed" && ["placed", "confirmed", "packed", "shipped", "out_for_delivery"].includes(o.fulfilment)));
  const openReturns = (await resolveReturns().listByCustomer(customerId)).some((r) => r.status === "pickup_scheduled" || r.status === "picked_up");
  if (busy || openReturns) {
    throw new AccountError("orders_in_progress", "You have an order or return in progress. You can delete your account once it's complete.");
  }

  const ledger = resolveLedger();
  const rows = await ledger.listByUser(customerId);
  const withdraw = (["terms_privacy", ...MARKETING_PURPOSES] as const).filter((p) => latest(rows, p) === "granted");
  if (withdraw.length) {
    await ledger.append(
      withdraw.map((purpose) => ({
        user_id: customerId,
        visitor_id: null,
        subscriber_id: null,
        purpose,
        status: "withdrawn" as const,
        method: "consent_settings" as const,
        source: ctx.source,
        notice_version: noticeVersion(["terms", "privacy"]),
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      })),
      now,
    );
  }
  await deps.customers.erase(customerId, now);
  await resolveLoyalty().erase(customerId);
  await resolveAlerts().erase(customerId);
  await resolveUgc().erase(customerId);
  revokeAllSessions(customerId);
  return { erased: true, keptOrderRecords: orders.length };
}
