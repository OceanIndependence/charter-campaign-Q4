#!/usr/bin/env node
/**
 * Backfill yachts in use to Sirv, in bounded batches.
 *
 *   npm run sirv:backfill                 up to 10 yachts
 *   npm run sirv:backfill -- 25           up to 25 yachts
 *   npm run sirv:backfill -- --facts 100  instead: fill picker-facts gaps for up to 100 yachts
 *
 * Reads selections/in-use.json (never fleet.json) and, for each yacht whose
 * images are not yet on Sirv, runs prepareYachtImages(yfId, { force: true }).
 * Requires IMAGE_STORE=sirv, the SIRV_* variables and YACHTFOLIO_PASSKEY
 * (env or a git-ignored .env.local). Deletes nothing from Blob. Without a
 * local environment use POST /api/admin/backfill-sirv?limit=N with the
 * CRON_SECRET bearer instead — same code, same batches.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Load KEY=value lines from .env.local into process.env when not already set (script use only). */
async function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  await loadEnvLocal();
  const args = process.argv.slice(2);
  const facts = args.includes("--facts");
  const n = Number.parseInt(args.filter((a) => !a.startsWith("--")).pop() ?? "", 10);
  const limit = Number.isInteger(n) && n > 0 ? n : undefined;
  const { backfillFacts, backfillSirv } = await import("../src/server/backfill.mjs");
  const result = facts ? await backfillFacts({ limit }) : await backfillSirv({ limit });
  console.log(JSON.stringify(result, null, 2));
  if (result.remaining > 0) console.log(`[backfill] ${result.remaining} still to do — run again.`);
}

main().catch((err) => {
  console.error(`[backfill] ${String(err?.message ?? err)}`);
  process.exitCode = 1;
});
