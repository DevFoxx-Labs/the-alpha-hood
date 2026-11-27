import type { Metadata } from "next";
import { ShippingScreen } from "@/components/admin/shipping";

export const metadata: Metadata = { title: "Shipping" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <ShippingScreen />;
}
