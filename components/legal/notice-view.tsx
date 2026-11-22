import Link from "next/link";
import { Fragment } from "react";
import type { RenderedNotice } from "@/lib/legal";
import { LEGAL_CONFIG, missingLegalFields } from "@/lib/legal/config";
import type { NoticeSection } from "@/lib/legal/types";

const LANG_LABEL = { en: "English", hi: "हिन्दी" } as const;

/** Internal paths mentioned in notice text become links (only our own routes — never arbitrary URLs). */
const PATH_RE = /(\/(?:legal|privacy|grievance|help|track-order|contact|about)(?:\/[a-z0-9-]+)*)/g;

export function linkify(text: string) {
  const parts = text.split(PATH_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Link key={i} href={part} className="underline underline-offset-2">
        {part}
      </Link>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function DraftNotice() {
  if (missingLegalFields(LEGAL_CONFIG).length === 0) return null;
  return (
    <p role="note" className="mb-8 border border-dashed border-accent bg-coupon px-4 py-3 text-[13px] leading-[1.6] text-ink">
      <strong>Draft:</strong> company and contact details marked &ldquo;TO BE PROVIDED&rdquo; are pending, and this text is
      awaiting legal review.
    </p>
  );
}

/** One renderer for every notice (DPDP rule §1). */
export function NoticeView({ notice }: { notice: RenderedNotice }) {
  const date = new Date(`${notice.lastUpdated}T00:00:00Z`).toLocaleDateString(notice.lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <article lang={notice.lang} className="mx-auto max-w-[860px] px-4 py-10 lg:px-0 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-ink-2">
        <Link href="/legal" className="hover:underline">
          Legal
        </Link>{" "}
        / <span className="text-ink">{notice.title}</span>
      </nav>
      <h1 className="type-section">{notice.title}</h1>
      <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">{notice.summary}</p>
      <p className="mt-4 text-[12px] uppercase tracking-[0.08em] text-ink-2">
        Version {notice.version} · Last updated {date}
      </p>
      {notice.languages.length > 1 ? (
        <p className="mt-3 flex gap-4 text-[13px]">
          {notice.languages.map((l) =>
            l === notice.lang ? (
              <span key={l} aria-current="page" className="font-bold">
                {LANG_LABEL[l]}
              </span>
            ) : (
              <Link key={l} href={l === "en" ? `/legal/${notice.slug}` : `/legal/${notice.slug}/${l}`} lang={l} className="underline underline-offset-2">
                {LANG_LABEL[l]}
              </Link>
            ),
          )}
        </p>
      ) : null}

      <div className="mt-10">
        <DraftNotice />
        {notice.sections.length > 4 ? (
          <nav aria-label="Contents" className="mb-10 border-y border-line py-5">
            <ol className="grid gap-1.5 text-[13.5px] sm:grid-cols-2">
              {notice.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="hover:underline">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <NoticeSections sections={notice.sections} />
      </div>
    </article>
  );
}

/** Shared section renderer for notices and help pages (paragraphs, lists, tables; internal paths linked). */
export function NoticeSections({ sections }: { sections: NoticeSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-line py-7 first:pt-0 last:border-0">
          <h2 className="text-[15px] font-bold uppercase tracking-[0.06em]">{s.heading}</h2>
          <div className="mt-4 flex flex-col gap-4 text-[14.5px] leading-[1.7] text-ink">
            {s.blocks.map((b, i) => {
              if (b.type === "p") return <p key={i}>{linkify(b.text)}</p>;
              if (b.type === "list")
                return (
                  <ul key={i} className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-2">
                    {b.items.map((item) => (
                      <li key={item}>{linkify(item)}</li>
                    ))}
                  </ul>
                );
              const headless = b.head.every((h) => h === "");
              return (
                <div key={i} className="overflow-x-auto border border-line">
                  <table className={`w-full border-collapse text-left text-[13px] leading-[1.55] ${headless ? "" : "min-w-[560px]"}`}>
                    {headless ? null : (
                      <thead className="bg-soft">
                        <tr>
                          {b.head.map((h) => (
                            <th key={h} scope="col" className="border-b border-line px-3 py-2.5 font-bold uppercase tracking-[0.04em]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {b.rows.map((row) => (
                        <tr key={row.join("|")} className="border-b border-line last:border-0 align-top">
                          {row.map((cell, ci) =>
                            headless && ci === 0 ? (
                              <th key={ci} scope="row" className="w-1/3 bg-soft px-3 py-2.5 font-bold">
                                {cell}
                              </th>
                            ) : (
                              <td key={ci} className="px-3 py-2.5">
                                {cell}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
