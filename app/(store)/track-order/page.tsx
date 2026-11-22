import type { Metadata } from "next";
import { TrackOrder } from "@/components/account/track-order";
import { Mascot } from "@/components/brand/mascot";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Track an order with your order number and the mobile number used to place it.",
  alternates: { canonical: "/track-order" },
};

/** ORD-03 public track-order page. */
export default function TrackOrderPage() {
  return (
    <div className="mx-auto grid max-w-[880px] items-center gap-6 px-4 py-10 lg:grid-cols-[1fr_340px] lg:gap-14 lg:py-16">
      <div className="max-w-[440px]">
        <h1 className="type-section">Track your order</h1>
        <p className="mb-6 mt-2 text-[14px] text-ink-2">Enter your order number and the mobile number you used. We&apos;ll text you a code.</p>
        <TrackOrder />
      </div>
      {/* MASCOT_PROMPTS #10 "Delivery run" (transparent cut-out). */}
      <Mascot name="alpha-10-delivery-run" sizes="(min-width: 1024px) 340px, 200px" className="order-first mx-auto w-[180px] lg:order-none lg:w-full" />
    </div>
  );
}
