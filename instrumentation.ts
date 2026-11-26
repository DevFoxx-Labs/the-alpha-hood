/**
 * Runs once when a server instance starts, before it serves a request. Applies the settings saved in
 * Admin → Settings over their environment variables (lib/settings/runtime.ts), so every reader of
 * `process.env` — kill switches, payment gateway, trackers, legal details — sees them from the first request.
 * Never blocks start-up on a missing or unreachable database: the store then runs from the environment alone.
 *
 * `onRequestError` reports server errors to Sentry when a DSN is configured (lib/ops/sentry.ts): no SDK, no
 * personal data, never throws.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSettingsRuntime } = await import("./lib/settings/runtime");
  await startSettingsRuntime();
  // The SMS provider made live in Admin → SMS providers (lib/providers/sms-runtime.ts).
  const { startSmsRuntime } = await import("./lib/providers/sms-runtime");
  await startSmsRuntime();
  // The email provider made live in Admin → Email providers (lib/providers/email-runtime.ts).
  const { startEmailRuntime } = await import("./lib/providers/email-runtime");
  await startEmailRuntime();
  // Where new uploads go (Admin → Storage) and how to reach older files (lib/storage/runtime.ts).
  const { startStorageRuntime } = await import("./lib/storage/runtime");
  await startStorageRuntime();
}

export async function onRequestError(error: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./lib/ops/sentry");
  await reportError(error, { path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType });
}
