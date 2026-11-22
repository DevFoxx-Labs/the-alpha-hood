import { randomToken } from "@/lib/auth/secrets";
import type { Address, AddressInput } from "@/lib/checkout/address";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Customers created at checkout by phone OTP (CHK-02 — "saves a customer account"). Platform customers
 * replace this store (Shopify customer / Medusa customer). Refused in production without a database.
 */
export interface Customer {
  id: string;
  phone: string;
  email: string | null;
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
  setEmail(id: string, email: string): Promise<void>;
  addAddress(id: string, address: AddressInput): Promise<Address>;
  /** Called once an order is confirmed (counts, coupon usage). */
  recordOrder(id: string, couponCode: string | null): Promise<void>;
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
        email: null,
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
    async setEmail(id, email) {
      const c = byId.get(id);
      if (c) c.email = email;
    },
    async addAddress(id, address) {
      const c = byId.get(id);
      if (!c) throw new Error("Customer not found");
      if (c.addresses.length >= MAX_ADDRESSES) throw new Error("Too many addresses");
      const saved: Address = { ...address, id: `adr_${randomToken(9)}` };
      c.addresses.push(saved);
      return saved;
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
  if (mockDataAllowed(env)) return devSingleton("customer_store", createMemoryCustomerStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Customers");
  };
  return { findOrCreateByPhone: fail, get: fail, setEmail: fail, addAddress: fail, recordOrder: fail };
}

/** What the browser may see about the signed-in customer. */
export function publicCustomer(c: Customer) {
  return {
    phone: `+91 ${"•".repeat(6)}${c.phone.slice(-4)}`,
    email: c.email,
    addresses: c.addresses,
  };
}
