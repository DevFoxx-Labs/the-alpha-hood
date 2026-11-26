import type { Metadata } from "next";
import { EmailProvidersScreen } from "@/components/admin/email-providers";
import { can } from "@/lib/admin/permissions";
import { currentStaff } from "@/lib/admin/server";
import { emailProvidersPayload } from "@/lib/providers/email-service";
import { resolveProviderStore } from "@/lib/providers/store";

export const metadata: Metadata = { title: "Email providers" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

/** Admin → Email providers. Owner only — checked here for the page and again by every /api/admin/email-providers route. */
export default async function Page() {
  const staff = await currentStaff();
  const allowed = !!staff && can(staff.role, "settings.manage");
  const payload = allowed ? await emailProvidersPayload(resolveProviderStore()).catch(() => null) : null;
  return <EmailProvidersScreen initial={payload} />;
}
