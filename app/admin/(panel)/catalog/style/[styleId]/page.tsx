import type { Metadata } from "next";
import { Suspense } from "react";
import { StyleEditorRoute } from "@/components/admin/style-editor";

export const metadata: Metadata = { title: "Edit product" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <StyleEditorRoute />
    </Suspense>
  );
}
