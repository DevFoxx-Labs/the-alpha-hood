import {
  Analytics01Icon,
  DashboardSquare01Icon,
  Discount01Icon,
  FileValidationIcon,
  Money03Icon,
  PackageIcon,
  ReturnRequestIcon,
  Shield01Icon,
  ShoppingBag02Icon,
  Store01Icon,
  TruckDeliveryIcon,
  UserGroupIcon,
  UserLock01Icon,
  WarehouseIcon,
  GiftIcon,
  HierarchySquare02Icon,
  Image01Icon,
  Layers01Icon,
  Mail01Icon,
  Message01Icon,
  Settings01Icon,
  HardDriveIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { can, type Permission, type Role, ROLES } from "@/lib/admin/permissions";

/**
 * Navigation is data (admin-panel-design §4). One list annotated with the permission each screen needs;
 * NAV_CONFIG (keyed by role) is derived from it with the same permission map the server enforces.
 * Dashboard first; Settings-type screens last; two levels maximum.
 */
export type NavItem =
  | { type: "section"; label: string }
  | { label: string; icon: IconSvgElement; route: string; permission: Permission; badgeKey?: string };

const ALL: NavItem[] = [
  { label: "Dashboard", icon: DashboardSquare01Icon, route: "/admin", permission: "dashboard" },
  { type: "section", label: "Orders" },
  { label: "Orders", icon: ShoppingBag02Icon, route: "/admin/orders", permission: "orders.read", badgeKey: "toPack" },
  { label: "Manifest", icon: TruckDeliveryIcon, route: "/admin/manifest", permission: "orders.ship" },
  { label: "Returns", icon: ReturnRequestIcon, route: "/admin/returns", permission: "returns.read", badgeKey: "awaitingQc" },
  { label: "Payouts", icon: Money03Icon, route: "/admin/payouts", permission: "refunds.issue", badgeKey: "payouts" },
  { type: "section", label: "Catalogue" },
  { label: "Inventory", icon: WarehouseIcon, route: "/admin/inventory", permission: "inventory.read" },
  { label: "Products", icon: PackageIcon, route: "/admin/catalog", permission: "catalog.read" },
  { label: "Categories", icon: HierarchySquare02Icon, route: "/admin/categories", permission: "catalog.read" },
  { label: "Collections", icon: Layers01Icon, route: "/admin/collections", permission: "catalog.read" },
  { label: "Promotions", icon: Discount01Icon, route: "/admin/promotions", permission: "promotions.read" },
  { label: "Gift cards", icon: GiftIcon, route: "/admin/giftcards", permission: "giftcards.issue" },
  { type: "section", label: "People" },
  { label: "Customers", icon: UserGroupIcon, route: "/admin/customers", permission: "customers.read" },
  { label: "Privacy requests", icon: Shield01Icon, route: "/admin/privacy", permission: "privacy.read", badgeKey: "privacy" },
  { label: "Subscribers", icon: Mail01Icon, route: "/admin/subscribers", permission: "subscribers.read" },
  { label: "#WearTheHood", icon: Image01Icon, route: "/admin/ugc", permission: "ugc.moderate" },
  { type: "section", label: "Insights" },
  { label: "Reports", icon: Analytics01Icon, route: "/admin/reports", permission: "reports.read" },
  { type: "section", label: "Admin" },
  { label: "Staff", icon: UserLock01Icon, route: "/admin/staff", permission: "staff.manage" },
  { label: "Audit log", icon: FileValidationIcon, route: "/admin/audit", permission: "audit.read" },
  { label: "View store", icon: Store01Icon, route: "/", permission: "dashboard" },
  { label: "SMS providers", icon: Message01Icon, route: "/admin/sms-providers", permission: "settings.manage" },
  { label: "Email providers", icon: Mail01Icon, route: "/admin/email-providers", permission: "settings.manage" },
  { label: "Storage", icon: HardDriveIcon, route: "/admin/storage", permission: "settings.manage" },
  { label: "Settings", icon: Settings01Icon, route: "/admin/settings", permission: "settings.manage" },
];

/** Drops screens the role can't use, then empty sections. */
function forRole(role: Role): NavItem[] {
  const items = ALL.filter((i) => "type" in i || can(role, i.permission));
  return items.filter((item, idx) => {
    if (!("type" in item)) return true;
    const next = items[idx + 1];
    return !!next && !("type" in next);
  });
}

export const NAV_CONFIG = Object.fromEntries(ROLES.map((r) => [r, forRole(r)])) as Record<Role, NavItem[]>;
