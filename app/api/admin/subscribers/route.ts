import { requireStaff } from "@/lib/admin/auth";
import { adminError, privateJson } from "@/lib/admin/http";
import { listSubscribers, resolveNewsletterStore } from "@/lib/newsletter/service";

/** GET `?channel&status&q&page` → newsletter subscribers, newest first, 50 a page. Contacts are masked here. */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "subscribers.read");
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await listSubscribers(resolveNewsletterStore(), new URL(request.url).searchParams));
  } catch (error) {
    return adminError(error);
  }
}
