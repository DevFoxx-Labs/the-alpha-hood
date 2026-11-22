/**
 * Dev-only pages (e.g. /dev/components) are refused in production unless ENABLE_DEV_PAGES is exactly
 * "true" (fail closed — for a protected preview deployment only, never the live store).
 */
export function devPagesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== "production") return true;
  return env.ENABLE_DEV_PAGES === "true";
}
