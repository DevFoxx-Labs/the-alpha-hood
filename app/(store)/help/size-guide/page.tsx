import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/brand/mascot";
import { SIZE_CHARTS, toInches } from "@/lib/catalog/size-charts";
import { STORE_CONFIG } from "@/lib/config/store";
import { breadcrumbJsonLd, toJsonLd } from "@/lib/seo/json-ld";
import { siteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Size guide",
  description: "Garment measurements for tops, bottoms and footwear, in centimetres and inches, and how to measure.",
  alternates: { canonical: "/help/size-guide" },
};

/** CMS-04 / PDP-03: every size chart on one page (the PDP shows the chart for its own product). */
export default function SizeGuidePage() {
  const crumbs = [
    { name: "Home", url: siteUrl("/") },
    { name: "Size guide", url: siteUrl("/help/size-guide") },
  ];
  return (
    <article className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbJsonLd(crumbs)) }} />
      <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-2">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span className="text-ink">Size guide</span>
      </nav>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="type-section">Size guide</h1>
          <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">
            Garment measurements, taken flat. Between sizes? Size up for a relaxed fit. Size exchanges are free within{" "}
            {STORE_CONFIG.returnWindowDays} days of delivery.
          </p>
        </div>
        {/* MASCOT_PROMPTS #8 "Measuring tape". */}
        <Mascot name="alpha-08-measuring" sizes="(min-width: 1024px) 160px, 96px" blend className="w-24 shrink-0 lg:w-40" />
      </div>
      {Object.entries(SIZE_CHARTS).map(([kind, chart]) => (
        <section key={kind} id={kind} className="scroll-mt-24 border-b border-line py-8 last:border-0">
          <h2 className="text-[15px] font-bold uppercase tracking-[0.06em]">{chart.title}</h2>
          <div className="mt-4 overflow-x-auto border border-line">
            <table className="w-full min-w-[480px] border-collapse text-left text-[13px] tabular-nums">
              <caption className="sr-only">
                {chart.title} measurements{chart.unitless ? "" : " in centimetres and inches"}
              </caption>
              <thead className="bg-soft">
                <tr>
                  <th scope="col" className="border-b border-line px-3 py-2.5 font-bold uppercase tracking-[0.04em]">
                    Size
                  </th>
                  {chart.columns.map((c) => (
                    <th key={c} scope="col" className="border-b border-line px-3 py-2.5 font-bold uppercase tracking-[0.04em]">
                      {c}
                      {chart.unitless ? "" : " (cm / in)"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r) => (
                  <tr key={r.size} className="border-b border-line last:border-0">
                    <th scope="row" className="px-3 py-2.5 font-bold">
                      {r.size}
                    </th>
                    {r.values.map((v, i) => (
                      <td key={i} className="px-3 py-2.5">
                        {chart.unitless ? v : `${v} / ${toInches(v)}`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid gap-2 text-[14px] leading-[1.6]">
            {chart.howToMeasure.map((m) => (
              <div key={m.label}>
                <dt className="inline font-bold">{m.label}: </dt>
                <dd className="inline text-ink-2">{m.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </article>
  );
}
