import type { Metadata } from "next";
import { FeedbackInbox } from "@/components/admin/feedback-inbox";

export const metadata: Metadata = { title: "Feedback" };
/** Personal to the signed-in staff member: no instant static shell expected (admin-panel-design §8). */
export const instant = false;

export default function Page() {
  return <FeedbackInbox />;
}
