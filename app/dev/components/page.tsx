import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { commerce } from "@/lib/commerce";
import { ANNOUNCEMENTS, HEADER_LINKS, MENU } from "@/lib/cms/mock";
import { devPagesEnabled } from "@/lib/dev-tools";
import { ComponentShowcase } from "./showcase";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/** M0/M1 deliverable: every DESIGN.md §3 component on one page. Dev-only (see lib/dev-tools.ts). */
export default async function DevComponentsPage() {
  if (!devPagesEnabled()) notFound();

  const [{ products }, categories] = await Promise.all([
    commerce.listProducts({ limit: 24 }),
    commerce.listCategories(),
  ]);

  return (
    <ComponentShowcase
      products={products}
      categories={categories}
      announcements={ANNOUNCEMENTS}
      headerLinks={HEADER_LINKS}
      menu={MENU}
    />
  );
}
