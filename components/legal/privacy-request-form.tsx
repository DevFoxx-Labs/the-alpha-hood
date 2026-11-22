"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { REQUEST_TYPES, type RequestType } from "@/lib/privacy/request-types";

const field = "flex flex-col gap-1.5";
const label = "text-[12px] font-bold uppercase tracking-[0.06em]";

/** DPDP ss.11–14 request form → POST /api/privacy-requests (server re-validates everything). */
export function PrivacyRequestForm({ ackHours, resolveDays }: { ackHours: number; resolveDays: number }) {
  const id = useId();
  const params = useSearchParams();
  const initial = params.get("type");
  const [type, setType] = useState<RequestType>(initial && Object.hasOwn(REQUEST_TYPES, initial) ? (initial as RequestType) : "access");
  const [declaration, setDeclaration] = useState(false);
  const [state, setState] = useState<
    { kind: "idle" | "sending" } | { kind: "error"; message: string } | { kind: "done"; reference: string }
  >({ kind: "idle" });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (!declaration) {
      setState({ kind: "error", message: "Please confirm the declaration." });
      return;
    }
    setState({ kind: "sending" });
    const body: Record<string, unknown> = {
      type,
      name: data.get("name"),
      contact: data.get("contact"),
      orderNumber: data.get("orderNumber") || undefined,
      details: data.get("details"),
      declaration,
    };
    if (type === "nomination") {
      body.nomineeName = data.get("nomineeName");
      body.nomineeContact = data.get("nomineeContact");
    }
    try {
      const res = await fetch("/api/privacy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { reference?: string; error?: { message?: string } } | null;
      if (res.ok && json?.reference) {
        setState({ kind: "done", reference: json.reference });
        return;
      }
      setState({
        kind: "error",
        message:
          res.status === 422 && json?.error?.message
            ? json.error.message
            : res.status === 429
              ? "Too many requests from this connection. Please try again later."
              : "We couldn't submit this right now. Please try again later, or email us (see the Grievance Officer page).",
      });
    } catch {
      setState({ kind: "error", message: "We couldn't submit this right now. Please try again later." });
    }
  }

  if (state.kind === "done") {
    return (
      <div role="status" className="border border-line bg-green-tint p-5 text-[14px] leading-[1.7]">
        <p className="font-bold">Request received — reference {state.reference}</p>
        <p className="mt-2">
          Keep this reference. We will acknowledge it within {ackHours} hours and respond within {resolveDays} days. Before
          acting on access, correction or deletion requests, we will confirm it&apos;s you with a one-time code sent to the
          contact you gave.
        </p>
        <p className="mt-2">
          Not satisfied with our answer? See the{" "}
          <Link href="/grievance" className="underline underline-offset-2">
            Grievance Officer
          </Link>{" "}
          page for escalation.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className={field}>
        <label htmlFor={`${id}-type`} className={label}>
          What do you need?
        </label>
        <select
          id={`${id}-type`}
          value={type}
          onChange={(e) => setType(e.target.value as RequestType)}
          className="h-12 border border-input bg-white px-3 text-[14px] outline-none focus-visible:border-black"
        >
          {(Object.keys(REQUEST_TYPES) as RequestType[]).map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPES[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className={field}>
          <label htmlFor={`${id}-name`} className={label}>
            Your name
          </label>
          <Input id={`${id}-name`} name="name" autoComplete="name" required minLength={2} maxLength={100} />
        </div>
        <div className={field}>
          <label htmlFor={`${id}-contact`} className={label}>
            Email or mobile on your account
          </label>
          <Input id={`${id}-contact`} name="contact" autoComplete="email" required maxLength={254} />
        </div>
      </div>
      <div className={field}>
        <label htmlFor={`${id}-order`} className={label}>
          Order number <span className="font-normal normal-case tracking-normal text-ink-2">(optional)</span>
        </label>
        <Input id={`${id}-order`} name="orderNumber" maxLength={40} />
      </div>
      {type === "nomination" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className={field}>
            <label htmlFor={`${id}-nn`} className={label}>
              Nominee&apos;s name
            </label>
            <Input id={`${id}-nn`} name="nomineeName" required minLength={2} maxLength={100} />
          </div>
          <div className={field}>
            <label htmlFor={`${id}-nc`} className={label}>
              Nominee&apos;s email or mobile
            </label>
            <Input id={`${id}-nc`} name="nomineeContact" required maxLength={254} />
          </div>
        </div>
      ) : null}
      <div className={field}>
        <label htmlFor={`${id}-details`} className={label}>
          Details
        </label>
        <textarea
          id={`${id}-details`}
          name="details"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          className="border border-input bg-white px-4 py-3 text-[14px] outline-none focus-visible:border-black"
        />
        <p className="text-[12px] text-ink-2">
          Please don&apos;t include card numbers, passwords or ID numbers. We&apos;ll ask for anything we need.
        </p>
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox id={`${id}-decl`} checked={declaration} onCheckedChange={(v) => setDeclaration(v === true)} className="mt-0.5" />
        <label htmlFor={`${id}-decl`} className="text-[13px] leading-[1.55]">
          This request is about my own personal data, or I am authorised to make it for the person concerned.
        </label>
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="text-[13px] font-semibold text-accent">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" loading={state.kind === "sending"} className="self-start">
        Send request
      </Button>
      <p className="text-[12px] text-ink-2">
        Free of charge. We use these details only to handle this request — see the{" "}
        <Link href="/legal/privacy" className="underline underline-offset-2">
          Privacy Notice
        </Link>
        .
      </p>
    </form>
  );
}
