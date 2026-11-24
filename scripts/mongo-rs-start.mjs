// `pnpm db:mongo:dev` — starts the project-local MongoDB replica set (port 27018, data in .data/) in the foreground.
// A Node launcher instead of a shell one-liner: the default MongoDB path has a space ("Program Files"), which
// Windows cmd can't run quoted from package.json. Override the binary with MONGOD_PATH.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const candidates = [
  process.env.MONGOD_PATH,
  "C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe",
  "C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe",
  "C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe",
  "/usr/bin/mongod",
  "/usr/local/bin/mongod",
  "/opt/homebrew/bin/mongod",
].filter(Boolean);
const mongod = candidates.find((p) => existsSync(p)) ?? "mongod";

const data = resolve(".data/mongo-rs");
mkdirSync(data, { recursive: true });
const args = ["--replSet", "rs0", "--port", "27018", "--bind_ip", "127.0.0.1", "--dbpath", data, "--logpath", resolve(".data/mongo-rs.log"), "--logappend"];
console.log(`Starting ${mongod} on 127.0.0.1:27018 (data: .data/mongo-rs). First time only: pnpm db:mongo:init`);
const child = spawn(mongod, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
