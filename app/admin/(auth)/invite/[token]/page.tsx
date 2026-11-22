import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInvite } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Join the team" };

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted/40" />}>
      <AcceptInvite />
    </Suspense>
  );
}
