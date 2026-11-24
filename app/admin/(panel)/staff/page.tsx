import type { Metadata } from "next";
import { StaffScreen } from "@/components/admin/screens";

export const metadata: Metadata = { title: "Staff" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return (
    <StaffScreen />
  );
}
