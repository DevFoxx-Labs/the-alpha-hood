import type { Metadata } from "next";
import { SubscribersScreen } from "@/components/admin/subscribers-list";

export const metadata: Metadata = { title: "Subscribers" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <SubscribersScreen />;
}
