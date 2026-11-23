import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProductEditorScreen } from "@/components/admin/product-editor";

export const metadata: Metadata = { title: "New product" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AdminShell title="New product">
        <ProductEditorScreen />
      </AdminShell>
    </Suspense>
  );
}
