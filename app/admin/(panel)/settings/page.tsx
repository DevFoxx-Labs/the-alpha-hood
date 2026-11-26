import type { Metadata } from "next";
import { SettingsScreen } from "@/components/admin/settings";
import { can } from "@/lib/admin/permissions";
import { currentStaff } from "@/lib/admin/server";
import { settingsPayload } from "@/lib/settings/service";
import { resolveSettingsStore } from "@/lib/settings/store";

export const metadata: Metadata = { title: "Settings" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

/**
 * Admin → Settings. The payload is read on the server and sent with the page, so the form is there on arrival.
 * Owner only — checked here for the page and again by every /api/admin/settings route for the data.
 */
export default async function Page({ searchParams }: PageProps<"/admin/settings">) {
  const [staff, params] = await Promise.all([currentStaff(), searchParams]);
  const allowed = !!staff && can(staff.role, "settings.manage");
  const payload = allowed ? await settingsPayload(resolveSettingsStore()).catch(() => null) : null;
  const section = typeof params.section === "string" ? params.section : undefined;
  return <SettingsScreen initial={payload} initialSection={section} />;
}
