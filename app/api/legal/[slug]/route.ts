import { isNoticeSlug, renderNotice } from "@/lib/legal";
import type { NoticeLang } from "@/lib/legal/types";

/** GET /api/legal/{slug}?lang=en|hi — the rendered notice (contact details filled in from config). */
export async function GET(request: Request, { params }: RouteContext<"/api/legal/[slug]">) {
  const { slug } = await params;
  if (!isNoticeSlug(slug)) return Response.json({ error: { code: "not_found", message: "Unknown notice." } }, { status: 404 });

  const langParam = new URL(request.url).searchParams.get("lang") ?? "en";
  const lang: NoticeLang = langParam === "hi" ? "hi" : "en";
  const notice = renderNotice(slug, lang);
  if (!notice) {
    return Response.json({ error: { code: "not_found", message: "Not available in this language." } }, { status: 404 });
  }
  return Response.json(notice, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" },
  });
}
