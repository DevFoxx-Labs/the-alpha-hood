import { randomBytes } from "node:crypto";
import type { CommerceAdapter } from "@/lib/commerce/types";
import type { Paise } from "@/lib/format";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";
import { notify } from "@/lib/notify/outbox";

/**
 * PDP-10 / LOY-04 product alerts the customer asks for: "notify me" when a sold-out size is back, and
 * "alert me if the price drops". Signed-in customers only (we message the verified phone / email on file —
 * no new contact data is collected). One alert fires once, then closes. Max 30 open alerts per customer.
 */
export type AlertKind = "back_in_stock" | "price_drop";

export interface ProductAlert {
  id: string;
  customerId: string;
  productId: string;
  /** Size for back-in-stock; null for price drop. */
  size: string | null;
  kind: AlertKind;
  /** Price when the alert was set (price drop compares against it). */
  priceAtSet: Paise;
  createdAt: string;
  firedAt: string | null;
}

export const MAX_OPEN_ALERTS = 30;
const ID_RE = /^al_[a-f0-9]{18}$/;

export interface AlertStore {
  create(a: Omit<ProductAlert, "id" | "createdAt" | "firedAt">, now?: Date): Promise<ProductAlert>;
  listByCustomer(customerId: string): Promise<ProductAlert[]>;
  open(productId?: string): Promise<ProductAlert[]>;
  fire(id: string, now?: Date): Promise<boolean>;
  remove(customerId: string, id: string): Promise<boolean>;
  erase(customerId: string): Promise<void>;
}

export function createMemoryAlertStore(): AlertStore {
  const alerts = new Map<string, ProductAlert>();
  return {
    async create(a, now = new Date()) {
      const dup = [...alerts.values()].find((x) => !x.firedAt && x.customerId === a.customerId && x.productId === a.productId && x.kind === a.kind && x.size === a.size);
      if (dup) return dup;
      const created = { ...a, id: `al_${randomBytes(9).toString("hex")}`, createdAt: now.toISOString(), firedAt: null };
      alerts.set(created.id, created);
      return created;
    },
    async listByCustomer(id) {
      return [...alerts.values()].filter((a) => a.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async open(productId) {
      return [...alerts.values()].filter((a) => !a.firedAt && (!productId || a.productId === productId));
    },
    async fire(id, now = new Date()) {
      const a = alerts.get(id);
      if (!a || a.firedAt) return false; // fire once (idempotent under retries)
      a.firedAt = now.toISOString();
      return true;
    },
    async remove(customerId, id) {
      if (!ID_RE.test(id)) return false;
      const a = alerts.get(id);
      if (!a || a.customerId !== customerId) return false; // someone else's id looks missing
      alerts.delete(id);
      return true;
    },
    async erase(customerId) {
      for (const [k, a] of alerts) if (a.customerId === customerId) alerts.delete(k);
    },
  };
}

export function resolveAlerts(env: Env = process.env): AlertStore {
  const db = dbStores(env);
  if (db) return db.alerts;
  if (mockDataAllowed(env)) return devSingleton("product_alerts", createMemoryAlertStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Product alerts");
  };
  return { create: fail, listByCustomer: fail, open: fail, fire: fail, remove: fail, erase: fail };
}

export class AlertError extends Error {
  constructor(
    public readonly code: "product_not_found" | "invalid_size" | "in_stock" | "too_many",
    message: string,
    public readonly status = 422,
  ) {
    super(message);
  }
}

/** Validates against the catalogue on the server (never trusts the client's idea of stock or price). */
export async function createAlert(
  deps: { commerce: CommerceAdapter; alerts: AlertStore },
  customerId: string,
  input: { productId: string; kind: AlertKind; size: string | null },
  now = new Date(),
) {
  const product = await deps.commerce.getProductById(input.productId);
  if (!product) throw new AlertError("product_not_found", "Product not found.", 404);
  if (input.kind === "back_in_stock") {
    if (!input.size || !product.sizes.some((s) => s.label === input.size)) throw new AlertError("invalid_size", "Choose a size.");
    if ((await deps.commerce.inventory.available(product.id, input.size, now)) > 0) throw new AlertError("in_stock", "This size is in stock — you can buy it now.", 409);
  }
  const open = (await deps.alerts.listByCustomer(customerId)).filter((a) => !a.firedAt);
  if (open.length >= MAX_OPEN_ALERTS) throw new AlertError("too_many", "You have too many alerts. Remove some first.", 429);
  return deps.alerts.create({ customerId, productId: product.id, size: input.kind === "back_in_stock" ? input.size : null, kind: input.kind, priceAtSet: product.price }, now);
}

/**
 * Checks open alerts (all, or one product after a restock / price change) and queues each message once.
 * Runs from the cron sweep and after stock adjustments; safe to run repeatedly.
 */
export async function sweepAlerts(deps: { commerce: CommerceAdapter; alerts: AlertStore }, productId?: string, now = new Date()) {
  let fired = 0;
  for (const a of await deps.alerts.open(productId)) {
    const product = await deps.commerce.getProductById(a.productId);
    if (!product) continue;
    const due =
      a.kind === "back_in_stock"
        ? a.size !== null && (await deps.commerce.inventory.available(product.id, a.size, now)) > 0
        : product.price < a.priceAtSet;
    if (!due) continue;
    if (!(await deps.alerts.fire(a.id, now))) continue;
    await notify(a.customerId, a.kind, { productId: product.id, handle: product.handle, ...(a.size ? { size: a.size } : {}) }, now);
    fired++;
  }
  return fired;
}
