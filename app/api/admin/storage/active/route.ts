import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { activateStorage } from "@/lib/storage/service";
import { asObject, rejectUnknownFields } from "@/lib/validation";

/**
 * POST /api/admin/storage/active `{ choice: "database" | "local" | "s3" | "r2", code }` — where new uploads go.
 * Needs a fresh authenticator code and, for a backend, a passed connection test. Old files stay where they are.
 */
export async function POST(request: Request) {
  const w = await adminWrite(request, "settings.manage", "storage-active", 128);
  if (!w.ok) return w.response;
  try {
    const input = asObject(w.body);
    rejectUnknownFields(input, ["choice", "code"]);
    await stepUp(w.staff, input.code);
    const change = await locks.run("admin:storage", () => activateStorage(resolveProviderStore(), input.choice, w.staff.id));
    await recordChange(w, String(input.choice), "activate", change, "storage");
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}
