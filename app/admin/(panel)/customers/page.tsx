import type { Metadata } from "next";
import { CustomersScreen } from "@/components/admin/screens";

export const metadata: Metadata = { title: "Customers" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return (
    <CustomersScreen />
  );
}
