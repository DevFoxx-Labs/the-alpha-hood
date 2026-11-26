/**
 * Runs once when a server instance starts, before it serves a request. Applies the settings saved in
 * Admin → Settings over their environment variables (lib/settings/runtime.ts), so every reader of
 * `process.env` — kill switches, payment gateway, trackers, legal details — sees them from the first request.
 * Never blocks start-up on a missing or unreachable database: the store then runs from the environment alone.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSettingsRuntime } = await import("./lib/settings/runtime");
  await startSettingsRuntime();
  // The SMS provider made live in Admin → SMS providers (lib/providers/sms-runtime.ts).
  const { startSmsRuntime } = await import("./lib/providers/sms-runtime");
  await startSmsRuntime();
}
