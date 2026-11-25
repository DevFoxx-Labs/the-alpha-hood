import type { Metadata } from "next";
import { ProductRedirect } from "@/components/admin/style-editor";

export const metadata: Metadata = { title: "Edit product" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

/** Old per-colour address: opens the product (style) this colour belongs to. */
export default function Page() {
  return <ProductRedirect />;
}
