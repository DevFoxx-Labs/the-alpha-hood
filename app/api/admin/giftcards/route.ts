import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { formatGiftCode, GIFT_CARD_RULES, resolveGiftCards } from "@/lib/giftcards/store";
import { jsonError } from "@/lib/http/guard";
import { asObject, cleanText, rejectUnknownFields } from "@/lib/validation";

const publicCard = (c: { hash: string; last4: string; initial: number; balance: number; issuedAt: string; expiresAt: string; issuedBy: string; note: string; disabled: boolean }) => ({
  id: c.hash.slice(0, 16),
  last4: c.last4,
  initial: c.initial,
  balance: c.balance,
  issuedAt: c.issuedAt,
  expiresAt: c.expiresAt,
  issuedBy: c.issuedBy,
  note: c.note,
  disabled: c.disabled,
});

/** GET — gift cards (masked: last 4 characters only). PROMO-06, `giftcards.issue`. */
export async function GET(request: Request) {
  const auth = requireStaff(request, "giftcards.issue");
  if (!auth.ok) return auth.response;
  try {
    return privateJson({ cards: (await resolveGiftCards().list()).map(publicCard), rules: GIFT_CARD_RULES });
  } catch (error) {
    return adminError(error);
  }
}

/** POST `{ amount (rupees), note }` — issue a card. The full code is returned ONCE and never stored or logged. */
export async function POST(request: Request) {
  const w = await adminWrite(request, "giftcards.issue", "giftcards", 512);
  if (!w.ok) return w.response;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["amount", "note"]);
    const rupees = input.amount;
    if (typeof rupees !== "number" || !Number.isInteger(rupees)) return jsonError(422, "invalid_input", "Enter a whole rupee amount.");
    const amount = rupees * 100;
    if (amount < GIFT_CARD_RULES.min || amount > GIFT_CARD_RULES.max) return jsonError(422, "invalid_input", `Gift cards are ₹${GIFT_CARD_RULES.min / 100}–₹${GIFT_CARD_RULES.max / 100}.`);
    const note = cleanText(input.note, "Reason", { min: 3, max: 200 });
    const { code, card } = await resolveGiftCards().issue({ amount, issuedBy: w.staff.email, note });
    await audit(w, "giftcard.issue", `GC…${card.last4}`, { amount, note });
    return privateJson({ code: formatGiftCode(code), card: publicCard({ ...card, balance: amount }) }, { status: 201 });
  } catch (error) {
    return adminError(error);
  }
}
