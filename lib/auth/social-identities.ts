import { dbStores } from "@/lib/db";
import { BackendUnavailableError, devSingleton, type Env, mockDataAllowed } from "@/lib/mock-guard";

/**
 * Which Google / Facebook account is linked to which customer. The customer account itself stays phone-based
 * (orders, COD and SMS need a verified mobile): a social account is only a faster way to sign in to it, linked once
 * the person has verified their mobile number. UNIQUE (provider, subject): one social account → one customer.
 * Removed on unlink and on account deletion (DPDP).
 */
export type SocialProvider = "google" | "facebook";
export const SOCIAL_PROVIDERS: readonly SocialProvider[] = ["google", "facebook"];

export interface SocialIdentity {
  provider: SocialProvider;
  subject: string;
  customerId: string;
  /** Verified email reported by the provider at link time (Google only); null otherwise. */
  email: string | null;
  createdAt: string;
}

export interface SocialIdentityStore {
  find(provider: SocialProvider, subject: string): Promise<SocialIdentity | null>;
  /** Links if the social account is not linked yet. False when it already belongs to someone (race-safe). */
  link(identity: SocialIdentity): Promise<boolean>;
  listFor(customerId: string): Promise<SocialIdentity[]>;
  unlink(customerId: string, provider: SocialProvider): Promise<boolean>;
  eraseCustomer(customerId: string): Promise<void>;
}

export const SUBJECT_RE = /^[0-9A-Za-z_-]{1,128}$/;

export function createMemorySocialIdentityStore(): SocialIdentityStore {
  const rows = new Map<string, SocialIdentity>();
  const k = (p: string, s: string) => `${p}|${s}`;
  return {
    async find(provider, subject) {
      const r = rows.get(k(provider, subject));
      return r ? { ...r } : null;
    },
    async link(identity) {
      const key = k(identity.provider, identity.subject);
      if (rows.has(key)) return false;
      rows.set(key, { ...identity });
      return true;
    },
    async listFor(customerId) {
      return [...rows.values()].filter((r) => r.customerId === customerId).map((r) => ({ ...r })).sort((a, b) => a.provider.localeCompare(b.provider));
    },
    async unlink(customerId, provider) {
      for (const [key, r] of rows) if (r.customerId === customerId && r.provider === provider) return rows.delete(key);
      return false;
    },
    async eraseCustomer(customerId) {
      for (const [key, r] of rows) if (r.customerId === customerId) rows.delete(key);
    },
  };
}

export function resolveSocialIdentities(env: Env = process.env): SocialIdentityStore {
  const db = dbStores(env);
  if (db) return db.socialIdentities;
  if (mockDataAllowed(env)) return devSingleton("social_identities", createMemorySocialIdentityStore);
  const fail = async (): Promise<never> => {
    throw new BackendUnavailableError("Social sign-in");
  };
  return { find: fail, link: fail, listFor: fail, unlink: fail, eraseCustomer: fail };
}
