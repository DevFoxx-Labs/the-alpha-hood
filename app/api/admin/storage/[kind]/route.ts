import { adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { providerError, recordChange, stepUp } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { STORAGE_IDS, type StorageDoc } from "@/lib/storage/runtime";
import { saveBackend } from "@/lib/storage/service";
import { asObject } from "@/lib/validation";

/**
 * PUT /api/admin/storage/<s3|r2> — saves that backend's keys (blank key = keep). Changing the ACTIVE backend's keys
 * needs a fresh authenticator code and a passing connection test before anything is saved.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/admin/storage/[kind]">) {
  const w = await adminWrite(request, "settings.manage", "storage", 4_096);
  if (!w.ok) return w.response;
  const { kind } = await params;
  try {
    const store = resolveProviderStore();
    const id = STORAGE_IDS[kind as keyof typeof STORAGE_IDS];
    if (id && (await store.get<StorageDoc>("storage", id))?.active) await stepUp(w.staff, asObject(w.body).code);
    const change = await locks.run("admin:storage", () => saveBackend(store, kind, w.body, w.staff.id));
    await recordChange(w, kind, "update", change, "storage");
    return privateJson(change);
  } catch (error) {
    return providerError(error);
  }
}
