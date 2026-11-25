/**
 * Formula-safe CSV cell (CWE-1236): spreadsheets run cells starting with = + - @ tab CR as formulas, so such cells
 * get a leading apostrophe. `uncsvCell` removes exactly that guard again when our own export is imported back.
 */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function uncsvCell(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}
