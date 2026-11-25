"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { showSubscribedToast } from "./toast";

type Channel = "email" | "whatsapp" | "sms";

const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
/** Words used in the consent sentence: "…from The Alpha Hood by email / on WhatsApp / by SMS". */
const CHANNEL_PHRASE: Record<Channel, string> = { email: "by email", whatsapp: "on WhatsApp", sms: "by SMS" };

/**
 * GLB-05 newsletter (on black). Unticked consent checkbox, one specific purpose, linked Privacy Notice.
 * The server re-validates `consent === true`; the client check is only for a quicker message.
 */
export function NewsletterForm() {
  const id = useId();
  const [channel, setChannel] = useState<Channel>("email");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; message?: string }>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setState({ kind: "error", message: "Please tick the box to agree to receive offers." });
      return;
    }
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, contact, consent }),
      });
      if (res.ok) {
        setState({ kind: "done" });
        showSubscribedToast(channel);
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setState({
        kind: "error",
        message:
          res.status === 422 && data?.error?.message
            ? data.error.message
            : res.status === 429
              ? "Too many attempts. Please try again in a few minutes."
              : "Couldn't sign you up right now. Please try again later.",
      });
    } catch {
      setState({ kind: "error", message: "Couldn't sign you up right now. Please try again later." });
    }
  }

  if (state.kind === "done") {
    return (
      <div role="status" className="border border-white/25 p-4 text-[13px] leading-[1.6] text-white">
        <p className="font-semibold">You&apos;re subscribed.</p>
        <p className="mt-1 text-white/75">
          You can unsubscribe any time from any message, or from{" "}
          <Link href="/privacy/consents" className="underline underline-offset-2">
            Your consents
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            setContact("");
            setConsent(false);
            setState({ kind: "idle" });
          }}
          className="mt-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] underline underline-offset-4"
        >
          Add another email or number
        </button>
      </div>
    );
  }

  const isEmail = channel === "email";
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Contact method" className="flex gap-4 text-[11.5px] font-semibold uppercase tracking-[0.1em]">
        {(["email", "whatsapp", "sms"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={channel === c}
            onClick={() => {
              setChannel(c);
              setContact("");
            }}
            className={cn("pb-1", channel === c ? "border-b-2 border-white text-white" : "text-white/60 hover:text-white")}
          >
            {CHANNEL_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="flex">
        <label htmlFor={`${id}-contact`} className="sr-only">
          {isEmail ? "Email address" : channel === "sms" ? "Mobile number for SMS" : "WhatsApp number"}
        </label>
        <input
          id={`${id}-contact`}
          type={isEmail ? "email" : "tel"}
          inputMode={isEmail ? "email" : "numeric"}
          autoComplete={isEmail ? "email" : "tel-national"}
          maxLength={isEmail ? 254 : 14}
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={isEmail ? "Your email" : "10-digit mobile number"}
          aria-invalid={state.kind === "error" || undefined}
          aria-describedby={state.kind === "error" ? `${id}-error` : undefined}
          className="h-12 min-w-0 flex-1 border border-white/35 bg-transparent px-4 text-[14px] text-white placeholder:text-white/50 outline-none focus-visible:border-white"
        />
        <Button type="submit" variant="on-dark" loading={state.kind === "sending"} className="h-12 px-5">
          Join
        </Button>
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={`${id}-consent`}
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5 border-white/60 bg-transparent data-[state=checked]:border-white [&>span]:bg-white"
        />
        <label htmlFor={`${id}-consent`} className="text-[12px] leading-[1.55] text-white/75">
          I agree to receive offers and new-drop updates from The Alpha Hood {CHANNEL_PHRASE[channel]}. I can
          unsubscribe any time. See the{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2">
            Privacy Notice
          </Link>
          .
        </label>
      </div>
      {state.kind === "error" ? (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-white">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
