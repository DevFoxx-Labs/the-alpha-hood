// Node module hooks for CLI scripts that import app code: resolves the `@/` alias to the project root and
// extension-less relative imports to `.ts` / `.tsx` / `index.ts` (what the bundler does for the app).
// Used as: node --experimental-transform-types --import ./scripts/alias-loader.mjs scripts/<script>.ts
import { existsSync, statSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!globalThis.__aliasHooksRegistered) {
  globalThis.__aliasHooksRegistered = true;
  register(import.meta.url, { data: { root: pathToFileURL(process.cwd() + "/").href } });
}

let root = "";
export function initialize(data) {
  root = data?.root ?? root;
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();

function withExtension(url) {
  const path = fileURLToPath(url);
  if (isFile(path)) return url;
  for (const ext of [".ts", ".tsx", "/index.ts"]) if (isFile(path + ext)) return pathToFileURL(path + ext).href;
  return url;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(withExtension(new URL(specifier.slice(2), root).href), context);
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    return next(withExtension(new URL(specifier, context.parentURL).href), context);
  }
  return next(specifier, context);
}
