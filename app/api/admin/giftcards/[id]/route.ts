import { audit } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { resolveGiftCards } from "@/lib/giftcards/store";
import { jsonError } from "@/lib/http/guard";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/** POST `{ disabled: boolean }` — block / unblock a card (e.g. reported lost or misused). Audited. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/giftcards/[id]">) {
  const w = await adminWrite(request, "giftcards.issue", "giftcards-toggle", 128);
  if (!w.ok) return w.response;
  try {
    const { id } = await ctx.params;
    if (!/^[a-f0-9]{16}$/.test(id)) return jsonError(404, "not_found", "Gift card not found.");
    const input = asObject(w.body);
    rejectUnknownFields(input, ["disabled"]);
    if (typeof input.disabled !== "boolean") return jsonError(422, "invalid_input", "Choose block or unblock.");
    const store = resolveGiftCards();
    const card = (await store.list(10_000)).find((c) => c.hash.startsWith(id));
    if (!card) return jsonError(404, "not_found", "Gift card not found.");
    await store.setDisabled(card.hash, input.disabled);
    await audit(w, input.disabled ? "giftcard.block" : "giftcard.unblock", `GC…${card.last4}`, {});
    return privateJson({ ok: true });
  } catch (error) {
    return adminError(error);
  }
}
