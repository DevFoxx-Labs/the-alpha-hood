import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * One persistent admin shell for every panel page (admin-panel-design §3). Living in the layout, the sidebar, topbar
 * and the signed-in staff state stay mounted across navigation — only the page area changes (no full-screen reload,
 * no re-fetch of /api/admin/me on every click). Pages render just their screen.
 */
export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
