import { revalidatePath } from "next/cache";
import { audit, requireStaff } from "@/lib/admin/auth";
import { adminError, adminWrite, privateJson } from "@/lib/admin/http";
import { locks } from "@/lib/concurrency/lock";
import { notificationsPayload, saveNotifications } from "@/lib/notify/switches-service";
import { resolveSettingsStore } from "@/lib/settings/store";

/**
 * Admin → Settings → Notifications (owner only). GET → every customer message with its SMS / email switches.
 * PUT `{ channels: { <event>: { sms?, email? } } }` → saves them; in force at once on this server, within a minute
 * on the others, and for messages already queued (the delivery worker checks again before sending).
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "settings.manage");
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await notificationsPayload(resolveSettingsStore()));
  } catch (error) {
    return adminError(error);
  }
}

export async function PUT(request: Request) {
  const w = await adminWrite(request, "settings.manage", "settings-notifications", 4_096);
  if (!w.ok) return w.response;
  try {
    const result = await locks.run("admin:settings", () => saveNotifications(resolveSettingsStore(), w.body, w.staff.id));
    if (result.changed.length) {
      await audit(w, "settings.update", "settings:notifications", { fields: result.changed.join(",").slice(0, 400), count: result.changed.length });
      try {
        revalidatePath("/", "layout");
      } catch {
        // outside a Next.js request there is nothing to refresh
      }
    }
    return privateJson(result);
  } catch (error) {
    return adminError(error);
  }
}
