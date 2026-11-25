import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInvite } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Set a new password", referrer: "no-referrer" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
      <AcceptInvite mode="reset" />
    </Suspense>
  );
}
