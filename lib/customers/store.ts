import { randomToken } from "@/lib/auth/secrets";
import type { Address, AddressInput } from "@/lib/checkout/address";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Customers (ACC-01). An account starts from a verified mobile number (phone OTP, CHK-02), a verified email (email
 * code / password sign-up) or a Google account (Google-verified email). Refused in production without a database.
 *
 * Identifiers that sign someone in are always verified ones and each belongs to one customer only (UNIQUE):
 * - `phone`: verified by an SMS code. null = this account has no mobile yet (started by email or Google). Erased
 *   accounts read as `erased:<id>`.
 * - `loginEmail`: verified by an email code or by Google. `email` is the contact address — it may be a newer,
 *   still-unverified address; it replaces `loginEmail` only once verified.
 */
export interface Customer {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  /** True once the customer proved they own `email` (a code sent to it, or a Google-verified address). */
  emailVerified: boolean;
  /** Verified email that signs this customer in (email code / password). null = none. */
  loginEmail: string | null;
  createdAt: string;
  addresses: Address[];
  orderCount: number;
  couponUses: Record<string, number>;
  /** CHK-07: blocked by ops after repeated refusals, or RTO count. */
  codBlocked: boolean;
  rtoCount: number;
}

export const MAX_ADDRESSES = 10;

/** The verified email is already the sign-in email of another customer (UNIQUE). */
export class EmailInUseError extends Error {
  constructor() {
    super("This email address is already used by another account.");
    this.name = "EmailInUseError";
  }
}

/** Placeholder held in the phone column (NOT NULL UNIQUE) by accounts without a mobile number yet. */
export const NO_PHONE_PREFIX = "none:";
export const isErased = (c: Pick<Customer, "phone">) => !!c.phone?.startsWith("erased:");

export interface CustomerStore {
  findOrCreateByPhone(phone: string, now?: Date): Promise<{ customer: Customer; created: boolean }>;
  /** Email-first sign-up: one customer per verified sign-in email even under a race (UNIQUE). `email` must be verified. */
  findOrCreateByEmail(email: string, now?: Date): Promise<{ customer: Customer; created: boolean }>;
  get(id: string): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  /** The customer whose VERIFIED sign-in email this is (never matches an unverified contact address). */
  findByLoginEmail(email: string): Promise<Customer | null>;
  /**
   * Gives an account without a mobile number the phone just verified by SMS. False when the account already has a
   * number or the number belongs to another customer (UNIQUE) — nothing changes then.
   */
  attachPhone(id: string, phone: string): Promise<boolean>;
  /**
   * Sets the contact email.
   * - `verified` (ownership just proved): it also becomes the sign-in email — throws EmailInUseError if it is
   *   another customer's sign-in email.
   * - not verified: stored as unverified; the old verified sign-in email keeps working until the new one is verified.
   * - null: removes the contact AND the sign-in email (callers make sure another sign-in method is left).
   */
  setEmail(id: string, email: string | null, verified?: boolean): Promise<void>;
  setName(id: string, name: string | null): Promise<void>;
  addAddress(id: string, address: AddressInput): Promise<Address>;
  removeAddress(id: string, addressId: string): Promise<boolean>;
  /** Replaces one of the customer's own addresses (owner-scoped: someone else's id behaves like a missing one). */
  updateAddress(id: string, addressId: string, address: AddressInput): Promise<Address | null>;
  /** Makes one address the default (and no other). False when it isn't this customer's. */
  setDefaultAddress(id: string, addressId: string): Promise<boolean>;
  /** DPDP erasure: removes contact details and addresses; the phone can sign up again as a new account. */
  erase(id: string, now?: Date): Promise<void>;
  /** Called once an order is confirmed (counts, coupon usage). */
  recordOrder(id: string, couponCode: string | null): Promise<void>;
  /** ADM-06 staff search (phone digits, name or email; capped). */
  search(query: string, limit?: number): Promise<Customer[]>;
  setCodBlocked(id: string, blocked: boolean): Promise<void>;
  /** CHK-07 RTO history (courier returned the parcel). */
  recordRto(id: string): Promise<void>;
}

export function newCustomerRecord(phone: string | null, now: Date, email: string | null = null): Customer {
  return {
    id: `cus_${randomToken(12)}`,
    phone,
    name: null,
    email,
    emailVerified: !!email,
    loginEmail: email,
    createdAt: now.toISOString(),
    addresses: [],
    orderCount: 0,
    couponUses: {},
    codBlocked: false,
    rtoCount: 0,
  };
}

export function createMemoryCustomerStore(): CustomerStore {
  const byId = new Map<string, Customer>();
  const byPhone = new Map<string, string>();
  const byLogin = new Map<string, string>();
  return {
    async findOrCreateByPhone(phone, now = new Date()) {
      const existing = byPhone.get(phone);
      if (existing) return { customer: byId.get(existing)!, created: false };
      const customer = newCustomerRecord(phone, now);
      byId.set(customer.id, customer);
      byPhone.set(phone, customer.id);
      return { customer, created: true };
    },
    async findOrCreateByEmail(email, now = new Date()) {
      const existing = byLogin.get(email);
      if (existing) return { customer: byId.get(existing)!, created: false };
      const customer = newCustomerRecord(null, now, email);
      byId.set(customer.id, customer);
      byLogin.set(email, customer.id);
      return { customer, created: true };
    },
    async get(id) {
      return byId.get(id) ?? null;
    },
    async findByPhone(phone) {
      const id = byPhone.get(phone);
      return id ? (byId.get(id) ?? null) : null;
    },
    async findByLoginEmail(email) {
      const id = byLogin.get(email);
      return id ? (byId.get(id) ?? null) : null;
    },
    async attachPhone(id, phone) {
      const c = byId.get(id);
      if (!c || c.phone !== null || byPhone.has(phone)) return false;
      c.phone = phone;
      byPhone.set(phone, id);
      return true;
    },
    async setEmail(id, email, verified = false) {
      const c = byId.get(id);
      if (!c) return;
      if (email && verified) {
        const owner = byLogin.get(email);
        if (owner && owner !== id) throw new EmailInUseError();
        if (c.loginEmail) byLogin.delete(c.loginEmail);
        byLogin.set(email, id);
        c.loginEmail = email;
      } else if (!email && c.loginEmail) {
        byLogin.delete(c.loginEmail);
        c.loginEmail = null;
      }
      c.email = email;
      c.emailVerified = !!email && (verified || email === c.loginEmail);
    },
    async setName(id, name) {
      const c = byId.get(id);
      if (c) c.name = name;
    },
    async removeAddress(id, addressId) {
      const c = byId.get(id);
      if (!c) return false;
      const gone = c.addresses.find((a) => a.id === addressId);
      if (!gone) return false;
      c.addresses = c.addresses.filter((a) => a.id !== addressId);
      if (gone.isDefault && c.addresses[0]) c.addresses[0] = { ...c.addresses[0], isDefault: true };
      return true;
    },
    async updateAddress(id, addressId, input) {
      const c = byId.get(id);
      const i = c ? c.addresses.findIndex((a) => a.id === addressId) : -1;
      if (!c || i < 0) return null;
      const wasDefault = !!c.addresses[i].isDefault;
      const next: Address = { ...input, id: addressId, isDefault: input.isDefault || wasDefault };
      if (next.isDefault) c.addresses = c.addresses.map((a) => ({ ...a, isDefault: false }));
      c.addresses[i] = next;
      return { ...next };
    },
    async setDefaultAddress(id, addressId) {
      const c = byId.get(id);
      if (!c || !c.addresses.some((a) => a.id === addressId)) return false;
      c.addresses = c.addresses.map((a) => ({ ...a, isDefault: a.id === addressId }));
      return true;
    },
    async erase(id, now = new Date()) {
      const c = byId.get(id);
      if (!c) return;
      if (c.phone) byPhone.delete(c.phone);
      if (c.loginEmail) byLogin.delete(c.loginEmail);
      void now;
      c.phone = `erased:${id}`;
      c.name = null;
      c.email = null;
      c.emailVerified = false;
      c.loginEmail = null;
      c.addresses = [];
    },
    async addAddress(id, address) {
      const c = byId.get(id);
      if (!c) throw new Error("Customer not found");
      if (c.addresses.length >= MAX_ADDRESSES) throw new Error("Too many addresses");
      // The first address is the default; a new default replaces the old one.
      const saved: Address = { ...address, id: `adr_${randomToken(9)}`, isDefault: !!address.isDefault || c.addresses.length === 0 };
      if (saved.isDefault) c.addresses = c.addresses.map((a) => ({ ...a, isDefault: false }));
      c.addresses.push(saved);
      return { ...saved };
    },
    async search(query, limit = 50) {
      const q = query.trim().toLowerCase().slice(0, 80);
      const digits = q.replace(/\D/g, "");
      const all = [...byId.values()].filter((c) => !isErased(c));
      const hits = q
        ? all.filter(
            (c) =>
              (digits.length >= 4 && !!c.phone?.includes(digits)) ||
              (c.name ?? "").toLowerCase().includes(q) ||
              (c.email ?? "").includes(q) ||
              c.id === q,
          )
        : all;
      return hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.min(limit, 100));
    },
    async setCodBlocked(id, blocked) {
      const c = byId.get(id);
      if (c) c.codBlocked = blocked;
    },
    async recordRto(id) {
      const c = byId.get(id);
      if (c) c.rtoCount += 1;
    },
    async recordOrder(id, couponCode) {
      const c = byId.get(id);
      if (!c) return;
      c.orderCount += 1;
      if (couponCode) c.couponUses[couponCode] = (c.couponUses[couponCode] ?? 0) + 1;
    },
  };
}

export function resolveCustomers(env: Env = process.env): CustomerStore {
  const db = dbStores(env);
  if (db) return db.customers;
  if (mockDataAllowed(env)) return devSingleton("customer_store", createMemoryCustomerStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Customers");
  };
  return {
    findOrCreateByPhone: fail,
    findOrCreateByEmail: fail,
    get: fail,
    findByPhone: fail,
    findByLoginEmail: fail,
    attachPhone: fail,
    setEmail: fail,
    setName: fail,
    addAddress: fail,
    removeAddress: fail,
    updateAddress: fail,
    setDefaultAddress: fail,
    erase: fail,
    recordOrder: fail,
    search: fail,
    setCodBlocked: fail,
    recordRto: fail,
  };
}

/** What the browser may see about the signed-in customer. `phone` is masked; null = no mobile number yet. */
export function publicCustomer(c: Customer) {
  return {
    phone: c.phone && !isErased(c) ? `+91 ${"•".repeat(6)}${c.phone.slice(-4)}` : null,
    name: c.name,
    email: c.email,
    emailVerified: c.emailVerified,
    loginEmail: c.loginEmail,
    addresses: c.addresses,
  };
}

/** Short label for staff screens and greetings: name, else masked phone, else email. */
export function customerLabel(c: Pick<Customer, "name" | "phone" | "email">): string {
  return c.name ?? (c.phone && !c.phone.startsWith("erased:") ? c.phone : null) ?? c.email ?? "Customer";
}
