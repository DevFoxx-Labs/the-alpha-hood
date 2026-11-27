/**
 * `pnpm geo:import-pincodes <file.csv>` — builds data/pincodes.json (pincode → [town, state]) from the Government of
 * India "All India Pincode Directory" CSV (Department of Posts, data.gov.in — Government Open Data License – India).
 * Download the CSV in a browser from data.gov.in (search "All India Pincode Directory"), then run this once.
 * Only reads the file you name and writes data/pincodes.json; no network, no database.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPincodeDirectory, PINCODES_FILE } from "@/lib/geo/pincodes";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: pnpm geo:import-pincodes <All_India_Pincode_Directory.csv>");
  process.exit(1);
}
try {
  const { directory, rows } = buildPincodeDirectory(readFileSync(file, "utf8"));
  const count = Object.keys(directory).length;
  if (count < 1000) throw new Error(`Only ${count} pincodes found — is this the all-India file?`);
  mkdirSync(path.dirname(PINCODES_FILE), { recursive: true });
  writeFileSync(PINCODES_FILE, JSON.stringify(directory));
  console.log(`Read ${rows} post offices → ${count} pincodes. Wrote ${path.relative(process.cwd(), PINCODES_FILE)}. Restart the server to use it.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
