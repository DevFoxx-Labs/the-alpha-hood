import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { settingsPayload } from "@/lib/settings/service";
import { resolveSettingsStore } from "@/lib/settings/store";

/**
 * GET — Admin → Settings (owner only): every group with each field's state. A secret field is never sent: the
 * page gets whether it is set, where it came from and a fingerprint.
 */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "settings.manage");
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await settingsPayload(resolveSettingsStore()));
  } catch (error) {
    return adminError(error);
  }
}
