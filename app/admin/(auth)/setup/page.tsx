import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSetup } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Set up" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
      <AdminSetup />
    </Suspense>
  );
}
