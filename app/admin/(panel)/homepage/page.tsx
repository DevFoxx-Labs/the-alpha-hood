import type { Metadata } from "next";
import { HomepageScreen } from "@/components/admin/homepage-editor";

export const metadata: Metadata = { title: "Homepage" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <HomepageScreen />;
}
