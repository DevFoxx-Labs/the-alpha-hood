import type { Metadata } from "next";
import { Suspense } from "react";
import { StyleEditorRoute } from "@/components/admin/style-editor";

export const metadata: Metadata = { title: "New product" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  // `?from=` (duplicate) is read on the client.
  return (
    <Suspense>
      <StyleEditorRoute />
    </Suspense>
  );
}
