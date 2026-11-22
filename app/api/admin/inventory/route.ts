import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { commerce } from "@/lib/commerce";
import { MOCK_PRODUCTS } from "@/lib/commerce/mock/data";
import { jsonError } from "@/lib/http/guard";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";

/** ADM-02 inventory. GET ?q=&low=1 ; POST `{ productId, size, delta, reason }` (audited, never below zero). */
export async function GET(request: Request) {
  const auth = requireStaff(request, "inventory.read");
  if (!auth.ok) return auth.response;
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") ?? "").toLowerCase().slice(0, 60);
  const low = p.get("low") === "1";
  try {
    const snap = await commerce.inventory.snapshot();
    const titles = new Map(MOCK_PRODUCTS.map((x) => [x.id, { title: x.title, sku: x.sku }]));
    const rows = snap
      .map((s) => ({ ...s, ...titles.get(s.productId)! }))
      .filter((r) => (!q || r.title.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)) && (!low || r.available <= 3));
    return privateJson({ rows: rows.slice(0, 500), total: rows.length });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  const w = await adminWrite(request, "inventory.write", "inventory", 512);
  if (!w.ok) return w.response;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["productId", "size", "delta", "reason"]);
    if (typeof input.productId !== "string" || typeof input.size !== "string" || typeof input.delta !== "number") {
      return jsonError(422, "invalid_input", "Choose a SKU and a whole-number change.");
    }
    const reason = cleanText(input.reason, "Reason", { min: 3, max: 200 });
    const onHand = await commerce.inventory.adjust(input.productId, input.size, input.delta);
    await audit(w, "inventory.adjust", `${input.productId}:${input.size}`, { delta: input.delta, onHand, reason });
    return privateJson({ ok: true, onHand });
  } catch (error) {
    return adminError(error);
  }
}
