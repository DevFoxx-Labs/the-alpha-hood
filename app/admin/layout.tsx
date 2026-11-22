import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · The Alpha Hood" },
  robots: { index: false, follow: false, nocache: true },
};

/** Theme applied before paint (no flash); the stored value is only "dark" or "light". */
const THEME_SCRIPT = "try{if(localStorage.getItem('admin-theme')==='dark')document.getElementById('admin-root').classList.add('dark')}catch(e){}";

/**
 * Admin root (admin-panel-design): scoped slate tokens via `.admin-root`, own top-right toaster.
 * Every screen is also refused on the server (requireStaff on each /api/admin route).
 */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div id="admin-root" className="admin-root min-h-screen bg-background font-sans text-foreground" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {children}
      <Toaster id="admin" position="top-right" richColors closeButton />
    </div>
  );
}
