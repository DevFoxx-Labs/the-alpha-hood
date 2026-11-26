import { Suspense } from "react";
import { AdminShell, ShellSkeleton } from "@/components/admin/admin-shell";
import { currentMe, sidebarCollapsed } from "@/lib/admin/server";

/**
 * One persistent admin shell for every panel page (admin-panel-design §3). Living in the layout, the sidebar, topbar
 * and the signed-in staff state stay mounted across navigation — only the page area changes.
 *
 * The session and the sidebar's collapsed state are read here, on the server, so the first HTML is the real shell:
 * no full-screen spinner while /api/admin/me loads and no sidebar width jump after hydration. Signed out: the
 * shell asks the API, which sends the browser to sign-in (and every API refuses on its own anyway).
 */
export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const [me, collapsed] = await Promise.all([currentMe(), sidebarCollapsed()]);
  return (
    <AdminShell initialMe={me} initialCollapsed={collapsed}>
      {children}
    </AdminShell>
  );
}
