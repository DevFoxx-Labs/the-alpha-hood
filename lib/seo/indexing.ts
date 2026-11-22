import { type Env, mockDataAllowed } from "@/lib/mock-guard";
import { readSiteUrl } from "./site";

/**
 * Search engines may index the site only on the live store: a production build with a real public SITE_URL
 * and no demo data. Fail closed — previews, `next dev` and demo builds are always disallowed.
 */
export function indexingAllowed(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" && readSiteUrl(env) !== "http://localhost:3000" && !mockDataAllowed(env) && env.ALLOW_INDEXING === "true";
}
