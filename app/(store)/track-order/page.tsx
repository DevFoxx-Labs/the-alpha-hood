import type { Metadata } from "next";
import { TrackOrder } from "@/components/account/track-order";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Track an order with your order number and the mobile number used to place it.",
  alternates: { canonical: "/track-order" },
};

/** ORD-03 public track-order page. */
export default function TrackOrderPage() {
  return (
    <div className="mx-auto max-w-[440px] px-4 py-10 lg:py-16">
      <h1 className="type-section">Track your order</h1>
      <p className="mb-6 mt-2 text-[14px] text-ink-2">Enter your order number and the mobile number you used. We&apos;ll text you a code.</p>
      <TrackOrder />
    </div>
  );
}
