import type { Metadata } from "next";
import { CollectionsScreen } from "@/components/admin/taxonomy";

export const metadata: Metadata = { title: "Collections" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <CollectionsScreen />;
}
