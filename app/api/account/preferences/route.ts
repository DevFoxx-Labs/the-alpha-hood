import { getPreferences, MARKETING_PURPOSES, setPreferences } from "@/lib/account/service";
import { resolveCustomers } from "@/lib/customers/store";
import { clientIp, guardPublicWrite, jsonError, userAgent } from "@/lib/http/guard";
import { commerceErrorResponse, privateJson, requireAccount } from "@/lib/http/commerce-http";
import { rateLimiter } from "@/lib/http/rate-limit";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * Notification preferences (ACC-02). Order updates are transactional and always sent; marketing toggles ARE
 * consents — every change is written to the consent ledger (DPDP rule §4) and off by default.
 */
export async function GET(request: Request) {
  const rl = rateLimiter.hit(`prefs-read:ip:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return jsonError(429, "rate_limited", "Too many requests.");
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await getPreferences(auth.customerId));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardPublicWrite(request, { name: "prefs", limit: 30, windowMs: 10 * 60_000, maxBytes: 256 });
  if (!guard.ok) return guard.response;
  const auth = requireAccount(request);
  if (!auth.ok) return auth.response;
  try {
    const input = asObject(guard.body);
    rejectUnknownFields(input, [...MARKETING_PURPOSES]);
    const wanted: Partial<Record<(typeof MARKETING_PURPOSES)[number], boolean>> = {};
    for (const p of MARKETING_PURPOSES) {
      if (input[p] === undefined) continue;
      if (typeof input[p] !== "boolean") return jsonError(422, "invalid_input", "Invalid preference.");
      wanted[p] = input[p] as boolean;
    }
    if (wanted.marketing_email) {
      const c = await resolveCustomers().get(auth.customerId);
      if (!c?.email) return jsonError(422, "email_required", "Add an email address first.");
    }
    return privateJson(await setPreferences(auth.customerId, wanted, { ip: guard.ip, userAgent: userAgent(request), source: "web" }));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
