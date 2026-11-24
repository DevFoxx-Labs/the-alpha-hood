import type { Metadata } from "next";
import { PayoutsScreen } from "@/components/admin/screens";

export const metadata: Metadata = { title: "Payouts" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return (
    <PayoutsScreen />
  );
}
