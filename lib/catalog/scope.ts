import { normaliseSearchTerm } from "./query";
import type { CatalogScope } from "./types";

const HANDLE_RE = /^[a-z0-9-]{1,120}$/;

/** Allow-list parse of a listing scope from API query params. */
export function parseScope(params: URLSearchParams): CatalogScope | null {
  switch (params.get("scope")) {
    case "all":
      return { kind: "all" };
    case "category": {
      const category = params.get("category") ?? "";
      const sub = params.get("sub");
      if (!HANDLE_RE.test(category) || (sub !== null && !HANDLE_RE.test(sub))) return null;
      return { kind: "category", category, ...(sub ? { subcategory: sub } : {}) };
    }
    case "collection": {
      const collection = params.get("collection") ?? "";
      return HANDLE_RE.test(collection) ? { kind: "collection", collection } : null;
    }
    case "search": {
      const q = normaliseSearchTerm(params.get("q"));
      return q ? { kind: "search", q } : null;
    }
    default:
      return null;
  }
}
