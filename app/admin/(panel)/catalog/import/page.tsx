import type { Metadata } from "next";
import { CatalogImportScreen } from "@/components/admin/catalog-import";

export const metadata: Metadata = { title: "Import products" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <CatalogImportScreen />;
}
