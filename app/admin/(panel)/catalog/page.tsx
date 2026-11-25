import type { Metadata } from "next";
import { CatalogScreen } from "@/components/admin/catalog-list";

export const metadata: Metadata = { title: "Products" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return (
    <CatalogScreen />
  );
}
