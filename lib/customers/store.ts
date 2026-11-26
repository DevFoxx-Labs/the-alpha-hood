import { randomToken } from "@/lib/auth/secrets";
import type { Address, AddressInput } from "@/lib/checkout/address";
import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Customers created at checkout by phone OTP (CHK-02 — "saves a customer account"). Platform customers
 * replace this store (Shopify customer / Medusa customer). Refused in production without a database.
 */
export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  /** True once the customer proved they own `email` (a code sent to it, or a Google-verified address). */
  emailVerified: boolean;
  createdAt: string;
  addresses: Address[];
  orderCount: number;
  couponUses: Record<string, number>;
  /** CHK-07: blocked by ops after repeated refusals, or RTO count. */
  codBlocked: boolean;
  rtoCount: number;
}

export const MAX_ADDRESSES = 10;

export interface CustomerStore {
  findOrCreateByPhone(phone: string, now?: Date): Promise<{ customer: Customer; created: boolean }>;
  get(id: string): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  /** Sets the email; `verified` only when ownership was just proved. Any change resets it to unverified. */
  setEmail(id: string, email: string | null, verified?: boolean): Promise<void>;
  setName(id: string, name: string | null): Promise<void>;
  addAddress(id: string, address: AddressInput): Promise<Address>;
  removeAddress(id: string, addressId: string): Promise<boolean>;
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

export function createMemoryCustomerStore(): CustomerStore {
  const byId = new Map<string, Customer>();
  const byPhone = new Map<string, string>();
  return {
    async findOrCreateByPhone(phone, now = new Date()) {
      const existing = byPhone.get(phone);
      if (existing) return { customer: byId.get(existing)!, created: false };
      const customer: Customer = {
        id: `cus_${randomToken(12)}`,
        phone,
        name: null,
        email: null,
        emailVerified: false,
        createdAt: now.toISOString(),
        addresses: [],
        orderCount: 0,
        couponUses: {},
        codBlocked: false,
        rtoCount: 0,
      };
      byId.set(customer.id, customer);
      byPhone.set(phone, customer.id);
      return { customer, created: true };
    },
    async get(id) {
      return byId.get(id) ?? null;
    },
    async findByPhone(phone) {
      const id = byPhone.get(phone);
      return id ? (byId.get(id) ?? null) : null;
    },
    async setEmail(id, email, verified = false) {
      const c = byId.get(id);
      if (c) {
        c.email = email;
        c.emailVerified = !!email && verified;
      }
    },
    async setName(id, name) {
      const c = byId.get(id);
      if (c) c.name = name;
    },
    async removeAddress(id, addressId) {
      const c = byId.get(id);
      if (!c) return false;
      const before = c.addresses.length;
      c.addresses = c.addresses.filter((a) => a.id !== addressId);
      return c.addresses.length < before;
    },
    async erase(id, now = new Date()) {
      const c = byId.get(id);
      if (!c) return;
      byPhone.delete(c.phone);
      c.phone = `erased:${now.toISOString()}`;
      c.name = null;
      c.email = null;
      c.emailVerified = false;
      c.addresses = [];
    },
    async addAddress(id, address) {
      const c = byId.get(id);
      if (!c) throw new Error("Customer not found");
      if (c.addresses.length >= MAX_ADDRESSES) throw new Error("Too many addresses");
      const saved: Address = { ...address, id: `adr_${randomToken(9)}` };
      c.addresses.push(saved);
      return saved;
    },
    async search(query, limit = 50) {
      const q = query.trim().toLowerCase().slice(0, 80);
      const digits = q.replace(/\D/g, "");
      const all = [...byId.values()].filter((c) => !c.phone.startsWith("erased:"));
      const hits = q
        ? all.filter(
            (c) =>
              (digits.length >= 4 && c.phone.includes(digits)) ||
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
    get: fail,
    findByPhone: fail,
    setEmail: fail,
    setName: fail,
    addAddress: fail,
    removeAddress: fail,
    erase: fail,
    recordOrder: fail,
    search: fail,
    setCodBlocked: fail,
    recordRto: fail,
  };
}

/** What the browser may see about the signed-in customer. */
export function publicCustomer(c: Customer) {
  return {
    phone: `+91 ${"•".repeat(6)}${c.phone.slice(-4)}`,
    name: c.name,
    email: c.email,
    emailVerified: c.emailVerified,
    addresses: c.addresses,
  };
}
