import type { GarmentKind, SizeChartKind } from "@/lib/commerce/types";

/** Fixed choices of the product form, shared by the server validator and the admin UI (client-safe). */
export const GARMENT_KINDS: readonly GarmentKind[] = ["tee", "oversized", "shirt", "check", "hoodie", "jacket", "puffer", "sweater", "jeans", "baggy", "cargo", "trouser", "sneaker", "shades", "cap", "polo"];
export const SIZE_CHARTS: readonly SizeChartKind[] = ["tops", "bottoms", "shoes", "none"];
