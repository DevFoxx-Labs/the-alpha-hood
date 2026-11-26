import type { Metadata } from "next";
import { StorageScreen } from "@/components/admin/storage";
import { can } from "@/lib/admin/permissions";
import { currentStaff } from "@/lib/admin/server";
import { resolveProviderStore } from "@/lib/providers/store";
import { storagePayload } from "@/lib/storage/service";

export const metadata: Metadata = { title: "Storage" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

/** Admin → Storage. Owner only — checked here for the page and again by every /api/admin/storage route. */
export default async function Page() {
  const staff = await currentStaff();
  const allowed = !!staff && can(staff.role, "settings.manage");
  const payload = allowed ? await storagePayload(resolveProviderStore()).catch(() => null) : null;
  return <StorageScreen initial={payload} />;
}
