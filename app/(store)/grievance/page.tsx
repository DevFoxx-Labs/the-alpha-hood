import type { Metadata } from "next";
import Link from "next/link";
import { DraftNotice } from "@/components/legal/notice-view";
import { Button } from "@/components/ui/button";
import { LEGAL_CONFIG } from "@/lib/legal/config";

export const metadata: Metadata = { title: "Grievance Officer", alternates: { canonical: "/grievance" } };

/**
 * Grievance Officer (DPDP s.8(10) / Rules; Consumer Protection (E-Commerce) Rules 2020 r.4(4)–(5)).
 * Every value comes from config; placeholders show until the owner provides them.
 */
export default function GrievancePage() {
  const c = LEGAL_CONFIG;
  const rows: [string, string][] = [
    ["Name", c.grievanceName],
    ["Designation", c.grievanceDesignation],
    ["Email", c.grievanceEmail],
    ["Phone", c.grievancePhone],
    ["Address", `${c.entityName}, ${c.registeredAddress}`],
  ];
  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <h1 className="type-section">Grievance Officer</h1>
      <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">
        For complaints about an order, a product, or how we handle your personal data.
      </p>

      <div className="mt-8">
        <DraftNotice />
      </div>

      <dl className="grid border border-line sm:grid-cols-[180px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="border-b border-line bg-soft px-4 py-3 text-[12px] font-bold uppercase tracking-[0.06em]">{k}</dt>
            <dd className="border-b border-line px-4 py-3 text-[14px] break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10 flex flex-col gap-4 text-[14.5px] leading-[1.7]">
        <h2 className="text-[15px] font-bold uppercase tracking-[0.06em]">How we handle your complaint</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            Send it using the{" "}
            <Link href="/privacy/request?type=grievance" className="underline underline-offset-2">
              request form
            </Link>{" "}
            or by email. You get a reference number straight away.
          </li>
          <li>We acknowledge it within {c.acknowledgeWithinHours} hours.</li>
          <li>We resolve it within {c.resolveWithinDays} days and tell you what we did.</li>
        </ol>
        <p>
          It is free. For data requests we confirm your identity first (usually a one-time code to the mobile number or
          email you gave us).
        </p>
        <h2 className="mt-4 text-[15px] font-bold uppercase tracking-[0.06em]">If you are not satisfied</h2>
        <p>
          Personal data complaints: after using our grievance process you may complain to the Data Protection Board of
          India under the Digital Personal Data Protection Act, 2023. Consumer complaints: the National Consumer Helpline
          (1915) or your consumer commission.
        </p>
      </section>

      <Button asChild className="mt-8">
        <Link href="/privacy/request?type=grievance">Raise a complaint</Link>
      </Button>
    </div>
  );
}
