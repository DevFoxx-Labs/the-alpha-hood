/**
 * ADM-08 staff roles (PRD §3) → permissions. The ONE source for both server authorization
 * (`requireStaff(request, permission)`) and which nav items a role sees. Hiding a link is never the control;
 * every /api/admin route checks its permission on the server.
 */
export const ROLES = ["owner", "store_manager", "catalog_editor", "support", "warehouse", "marketing", "finance"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard",
  "orders.read",
  "orders.write", // hold / release / confirm high-risk COD / cancel
  "orders.ship", // pack, ship, delivery status, labels, manifest
  "returns.read",
  "returns.qc", // pickup + quality check (settles the return)
  "refunds.issue", // COD refund payouts, up to the role's limit
  "customers.read",
  "customers.write", // block COD, store credit adjustments
  "inventory.read",
  "inventory.write",
  "catalog.read",
  "promotions.read",
  "reports.read",
  "privacy.read",
  "privacy.write",
  "staff.manage",
  "audit.read",
  "ugc.moderate",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  store_manager: [
    "dashboard", "orders.read", "orders.write", "orders.ship", "returns.read", "returns.qc", "refunds.issue",
    "customers.read", "customers.write", "inventory.read", "inventory.write", "catalog.read", "promotions.read",
    "reports.read", "privacy.read", "ugc.moderate",
  ],
  catalog_editor: ["dashboard", "catalog.read", "inventory.read", "promotions.read"],
  support: ["dashboard", "orders.read", "orders.write", "returns.read", "refunds.issue", "customers.read", "privacy.read", "privacy.write"],
  warehouse: ["dashboard", "orders.read", "orders.ship", "returns.read", "returns.qc", "inventory.read", "inventory.write"],
  marketing: ["dashboard", "catalog.read", "promotions.read", "reports.read", "ugc.moderate"],
  finance: ["dashboard", "orders.read", "returns.read", "refunds.issue", "customers.read", "reports.read"],
};

/** Money limits per action (paise). Above the limit the action needs an owner or finance. */
export const MONEY_LIMITS: Partial<Record<Role, { refund: number; credit: number }>> = {
  owner: { refund: Number.MAX_SAFE_INTEGER, credit: Number.MAX_SAFE_INTEGER },
  finance: { refund: Number.MAX_SAFE_INTEGER, credit: 0 },
  store_manager: { refund: 1_000_000, credit: 200_000 },
  support: { refund: 500_000, credit: 0 },
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_META: Record<Role, { label: string; color: string; subtitle: string }> = {
  owner: { label: "Owner", color: "bg-red-500/10 text-red-600 dark:text-red-400", subtitle: "Everything, including staff and audit." },
  store_manager: { label: "Store manager", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", subtitle: "Orders, returns, stock and customers." },
  catalog_editor: { label: "Catalog editor", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400", subtitle: "Products and stock levels." },
  support: { label: "Customer support", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", subtitle: "Orders, returns, refunds and privacy requests." },
  warehouse: { label: "Warehouse", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", subtitle: "Pick, pack, ship and quality checks." },
  marketing: { label: "Marketing", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400", subtitle: "Catalogue, promotions and reports." },
  finance: { label: "Finance", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400", subtitle: "Payouts, refunds and reports." },
};
