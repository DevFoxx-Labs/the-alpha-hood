import { requireStaff } from "@/lib/admin/auth";
import { privateJson } from "@/lib/admin/http";
import { providerError } from "@/lib/providers/http";
import { resolveProviderStore } from "@/lib/providers/store";
import { storagePayload } from "@/lib/storage/service";

/** GET — Admin → Storage (owner only): which storage takes new uploads and each backend's state (keys masked). */
export async function GET(request: Request) {
  const auth = await requireStaff(request, "settings.manage");
  if (!auth.ok) return auth.response;
  try {
    return privateJson(await storagePayload(resolveProviderStore()));
  } catch (error) {
    return providerError(error);
  }
}
