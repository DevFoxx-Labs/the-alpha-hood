import type { Metadata } from "next";
import { CategoriesScreen } from "@/components/admin/taxonomy";

export const metadata: Metadata = { title: "Categories" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <CategoriesScreen />;
}
