import { revalidatePath } from "next/cache";
import { audit, confirmTotp } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { PRIVATE_NO_STORE } from "@/lib/http/guard";
import { settingGroup } from "@/lib/settings/catalog";
import { saveSettingsGroup, SettingsError } from "@/lib/settings/service";
import { resolveSettingsStore } from "@/lib/settings/store";
import { asObject } from "@/lib/validation";

/**
 * PUT `{ fields: { KEY: value }, clear?: [KEY], code? }` — saves one settings group (owner only).
 * - The group and every field are checked against lib/settings/catalog.ts: nothing else can be written.
 * - Groups marked `stepUp` (payment keys) also need a fresh authenticator code.
 * - The audit log records which fields changed, never their values.
 * - Cached storefront pages are refreshed so a new footer link, tracker ID or legal detail shows at once.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/admin/settings/[group]">) {
  const w = await adminWrite(request, "settings.manage", "settings", 16_384);
  if (!w.ok) return w.response;
  const { group: groupId } = await params;
  try {
    const group = settingGroup(groupId);
    if (!group) throw new SettingsError(404, "not_found", "Unknown settings section.");
    if (group.stepUp) await confirmTotp(w.staff, asObject(w.body).code);
    // One writer at a time: two owners saving the same group can't interleave their read-then-write.
    const result = await locks.run("admin:settings", () => saveSettingsGroup(resolveSettingsStore(), groupId, w.body, w.staff.id));
    if (result.changed.length) {
      await audit(w, "settings.update", `settings:${groupId}`, { fields: result.changed.join(",").slice(0, 400), count: result.changed.length });
      try {
        revalidatePath("/", "layout");
      } catch {
        // Outside a Next.js request (tests, scripts) there is no page cache to refresh.
      }
    }
    return privateJson(result);
  } catch (error) {
    if (error instanceof SettingsError) {
      return Response.json({ error: { code: error.code, message: error.message, fields: error.fields } }, { status: error.status, headers: PRIVATE_NO_STORE });
    }
    return adminError(error);
  }
}
