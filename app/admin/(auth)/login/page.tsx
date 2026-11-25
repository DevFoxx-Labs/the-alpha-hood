import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLogin } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
      <AdminLogin />
    </Suspense>
  );
}
