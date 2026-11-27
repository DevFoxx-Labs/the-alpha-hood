import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Pincode → district (town / city) and state, from the Government of India's "All India Pincode Directory"
 * (Department of Posts, data.gov.in, Government Open Data License – India; attribution in the Privacy / About pages
 * isn't required for the lookup itself, but credit "Source: India Post, data.gov.in" in docs).
 *
 * The owner downloads the CSV once and runs `pnpm geo:import-pincodes <file.csv>`, which writes the compact
 * `data/pincodes.json` (`{ "411045": ["Pune", "Maharashtra"], … }`). No file = no names (the delivery check still
 * works, it just doesn't name the town). Read once per process, server only. Nothing about the shopper is stored.
 */
export const PINCODES_FILE = path.join(process.cwd(), "data", "pincodes.json");

type Directory = Record<string, [string, string]>;
const g = globalThis as unknown as { __alpha_hood_pincodes?: Directory | null };

function load(file = PINCODES_FILE): Directory | null {
  if (g.__alpha_hood_pincodes !== undefined) return g.__alpha_hood_pincodes;
  try {
    g.__alpha_hood_pincodes = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Directory) : null;
  } catch {
    g.__alpha_hood_pincodes = null;
  }
  return g.__alpha_hood_pincodes;
}

/** For tests / after an import in a long-running process. */
export const forgetPincodeDirectory = () => {
  delete g.__alpha_hood_pincodes;
};

export function pincodePlace(pincode: string, file?: string): { city: string; state: string } | null {
  if (!/^[1-9]\d{5}$/.test(pincode)) return null;
  const hit = load(file)?.[pincode];
  return hit ? { city: hit[0], state: hit[1] } : null;
}

const title = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|Of)\b/g, (m) => m.toLowerCase());

/** One CSV line, with quoted fields ("a, b"). */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Builds the directory from the official CSV. Finds the pincode / district / state columns by name (the file has
 * used `pincode`, `Districtname` / `district`, `statename` / `StateName`); one entry per pincode (the first post office
 * listed). Throws if the columns can't be found.
 */
export function buildPincodeDirectory(csv: string): { directory: Directory; rows: number } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("The file has no rows.");
  const head = splitCsv(lines[0]).map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const pin = col("pincode", "pin");
  const district = col("districtname", "district");
  const state = col("statename", "state");
  if (pin < 0 || district < 0 || state < 0) throw new Error(`Couldn't find the pincode / district / state columns (found: ${head.join(", ")}).`);
  const directory: Directory = {};
  let rows = 0;
  for (const line of lines.slice(1)) {
    const f = splitCsv(line);
    const p = (f[pin] ?? "").trim();
    if (!/^[1-9]\d{5}$/.test(p)) continue;
    rows++;
    if (directory[p]) continue;
    const d = (f[district] ?? "").trim();
    const s = (f[state] ?? "").trim();
    if (!d || !s || /^(na|n\/a|null)$/i.test(d)) continue;
    directory[p] = [title(d).slice(0, 60), title(s).slice(0, 60)];
  }
  return { directory, rows };
}
