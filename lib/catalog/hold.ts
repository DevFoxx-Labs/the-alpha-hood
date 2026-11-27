import type { AlertStore } from "@/lib/alerts/service";
import { ValidationError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";
import { type CatalogAdminDeps, CatalogAdminError } from "./admin";
import { STYLE_ID_RE } from "./style";
import { CatalogConflictError, type ProductRecord } from "./store";

/**
 * "Show as sold out" — a demand test. Staff switch a product (one colour, or every colour of a style) to sold out
 * although it is in stock: the store shows every size as sold out, nobody can buy it, and customers can only ask to be
 * told when it's on sale (the PDP-10 "Notify me" alert, per size). Admin shows how many are waiting per size. Switching
 * it off puts the real stock back on sale and sends the waiting alerts (the route runs the alert sweep).
 *
 * Threat model:
 * - a shopper buying a held product with a crafted request → the storefront inventory answers 0 and refuses to reserve
 *   it (`holdInventory`), so the bag, Buy now and checkout all fail on the server, whatever the screen shows (prevent);
 * - a hold silently wiping real stock → the flag never touches stock; the inventory reads the raw catalogue view (prevent);
 * - toggling another style's colours → every id must belong to the style in the URL (prevent, tested);
 * - two staff racing / a stale editor → versions checked in one transaction, stale → 409 (prevent);
 * - toggling without rights → `catalog.write`, same-origin, rate-limited, audited by the route (prevent + detect);
 * - leaking who is waiting → admin gets counts per size only, never customers (prevent).
 */
export { holdInventory } from "./hold-inventory";

export interface HoldResult {
  styleId: string;
  on: boolean;
  /** Colours whose switch changed. */
  changed: string[];
}

/** Body `{ on: boolean, ids?: string[] }` — `ids` = colours of this style (absent = every colour). One transaction. */
export async function setStyleHold(deps: CatalogAdminDeps, styleId: string, body: unknown, now = new Date()): Promise<HoldResult> {
  const b = asObject(body);
  rejectUnknownFields(b, ["on", "ids"]);
  if (typeof b.on !== "boolean") throw new ValidationError("Say whether to switch it on or off.");
  if (!STYLE_ID_RE.test(styleId)) throw new CatalogAdminError("not_found", "Product not found.", 404);
  const colours = (await deps.store.listRecords()).filter((r) => r.styleId === styleId);
  if (!colours.length) throw new CatalogAdminError("not_found", "Product not found.", 404);

  let targets: ProductRecord[] = colours;
  if (b.ids !== undefined) {
    if (!Array.isArray(b.ids) || b.ids.length < 1 || b.ids.length > colours.length) throw new ValidationError("Choose the colours to switch.");
    const byId = new Map(colours.map((r) => [r.id, r]));
    const seen = new Set<string>();
    targets = b.ids.map((id) => {
      // Ownership: only colours of THIS style can be switched through it.
      const r = typeof id === "string" ? byId.get(id) : undefined;
      if (!r || seen.has(r.id)) throw new ValidationError("That colour doesn't belong to this product. Reload the page.");
      seen.add(r.id);
      return r;
    });
  }

  const on = b.on;
  const replaces = targets
    .filter((r) => (r.soldOutHold === true) !== on)
    .map((r) => {
      const { soldOutHold: _h, ...rest } = r;
      void _h;
      return { record: { ...rest, ...(on ? { soldOutHold: true } : {}), version: r.version + 1, updatedAt: now.toISOString() }, expectedVersion: r.version };
    });
  if (replaces.length) {
    let ok: boolean;
    try {
      ok = await deps.store.writeMany([], replaces);
    } catch (e) {
      if (e instanceof CatalogConflictError) throw new CatalogAdminError("conflict", e.message, 409);
      throw e;
    }
    if (!ok) throw new CatalogAdminError("version_conflict", "Someone else changed this product. Reload and try again.", 409);
    deps.invalidate();
  }
  return { styleId, on, changed: replaces.map((x) => x.record.id) };
}

/** Back-in-stock sign-ups per colour: still waiting (per size) and already told. Counts only — no customers. */
export interface Demand {
  waiting: number;
  bySize: Record<string, number>;
  notified: number;
}

export const MAX_DEMAND_PRODUCTS = 100;

export async function demandFor(alerts: AlertStore, productIds: string[]): Promise<Record<string, Demand>> {
  const ids = [...new Set(productIds)].slice(0, MAX_DEMAND_PRODUCTS);
  const out: Record<string, Demand> = Object.fromEntries(ids.map((id) => [id, { waiting: 0, bySize: {}, notified: 0 }]));
  if (!ids.length) return out;
  for (const a of await alerts.forProducts(ids)) {
    const d = out[a.productId];
    if (!d || a.kind !== "back_in_stock") continue;
    if (a.firedAt) d.notified++;
    else {
      d.waiting++;
      const size = a.size ?? "—";
      d.bySize[size] = (d.bySize[size] ?? 0) + 1;
    }
  }
  return out;
}
