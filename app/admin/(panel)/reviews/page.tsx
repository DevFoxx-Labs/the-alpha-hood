import type { Metadata } from "next";
import { ReviewsModeration } from "@/components/admin/reviews-moderation";

export const metadata: Metadata = { title: "Reviews" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <ReviewsModeration />;
}
