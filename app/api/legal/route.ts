import { noticeIndex } from "@/lib/legal";

/** GET /api/legal — every notice with version, date and languages (for the website and apps). */
export async function GET() {
  return Response.json(
    { notices: noticeIndex() },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" } },
  );
}
