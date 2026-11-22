import type { Metadata } from "next";
import { CheckoutApp } from "@/components/checkout/checkout-app";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

/** M5 checkout (reference/04-checkout.png). Personal and cart data load on the client from no-store APIs. */
export default function CheckoutPage() {
  return <CheckoutApp />;
}
