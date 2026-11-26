import type { Metadata } from "next";
import { SmsProvidersScreen } from "@/components/admin/sms-providers";
import { can } from "@/lib/admin/permissions";
import { currentStaff } from "@/lib/admin/server";
import { smsProvidersPayload } from "@/lib/providers/sms-service";
import { resolveProviderStore } from "@/lib/providers/store";

export const metadata: Metadata = { title: "SMS providers" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

/**
 * Admin → SMS providers. The list is read on the server and sent with the page (keys masked).
 * Owner only — checked here for the page and again by every /api/admin/sms-providers route.
 */
export default async function Page() {
  const staff = await currentStaff();
  const allowed = !!staff && can(staff.role, "settings.manage");
  const payload = allowed ? await smsProvidersPayload(resolveProviderStore()).catch(() => null) : null;
  return <SmsProvidersScreen initial={payload} />;
}
