import type { Metadata } from "next";
import { ProductEditorScreen } from "@/components/admin/product-editor";

export const metadata: Metadata = { title: "New product" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return (
    <ProductEditorScreen />
  );
}
