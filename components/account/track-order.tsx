"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { OtpSignIn } from "./otp-sign-in";

/** ORD-03: order number + phone OTP, then the order page (signed in as the order's owner). */
export function TrackOrder() {
  const id = useId();
  const router = useRouter();
  const [number, setNumber] = useState("");
  const valid = /^AH[0-9A-Z]{8}$/.test(number);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-order`} className="text-[12px] font-bold uppercase tracking-[0.06em]">
          Order number
        </label>
        <Input
          id={`${id}-order`}
          placeholder="AH…"
          autoComplete="off"
          maxLength={10}
          value={number}
          onChange={(e) => setNumber(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10))}
          className="tabular uppercase tracking-[0.1em]"
        />
      </div>
      {valid ? (
        <OtpSignIn key={number} orderNumber={number} submitLabel="Send code" onSignedIn={() => router.push(`/account/orders/${number}`)} />
      ) : (
        <p className="text-[12.5px] text-ink-2">Your order number starts with AH and is in your order SMS and email.</p>
      )}
    </div>
  );
}
