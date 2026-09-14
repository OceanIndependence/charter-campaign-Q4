#!/usr/bin/env node
/**
 * Build step: data/consultants-seed.csv → src/data/consultants-seed.ts.
 *
 *   npm run consultants:seed:build          regenerate the module
 *   npm run consultants:seed:build -- --check   exit 1 if the committed module is stale
 *
 * The CSV stays the editable source of truth in the repo; the generated
 * TypeScript module is committed too and is what the deployed app imports,
 * so nothing reads the filesystem at runtime on Vercel. `prebuild` runs
 * this before every `next build`, so the module can never lag the CSV in a
 * deployment. Edit the CSV, commit both files.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSeed } from "./lib/seed-csv.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED = path.join(ROOT, "data", "consultants-seed.csv");
const OUT = path.join(ROOT, "src", "data", "consultants-seed.ts");

export function renderModule(rows) {
  const lines = [
    "/**",
    " * GENERATED FILE — do not edit. Source: data/consultants-seed.csv.",
    " * Regenerate with `npm run consultants:seed:build` (also runs on `prebuild`).",
    " *",
    ` * ${rows.length} row(s). Emails are already lowercase. \`line\` is the CSV line,`,
    " * for the import report.",
    " */",
    "",
    'import type { ConsultantSeedRow } from "@/lib/consultant-seed-types";',
    "",
    "export const CONSULTANT_SEED_ROWS: readonly ConsultantSeedRow[] = [",
    ...rows.map((r) => `  ${JSON.stringify(r)},`),
    "];",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const check = process.argv.includes("--check");
  const rows = readSeed(await readFile(SEED, "utf8"));
  const next = renderModule(rows);
  const current = await readFile(OUT, "utf8").catch(() => null);
  if (check) {
    if (current !== next) {
      console.error(`[seed] ${path.relative(ROOT, OUT)} is out of date with the CSV — run npm run consultants:seed:build and commit.`);
      process.exitCode = 1;
    } else console.log(`[seed] ${path.relative(ROOT, OUT)} is up to date (${rows.length} rows).`);
    return;
  }
  if (current === next) {
    console.log(`[seed] ${path.relative(ROOT, OUT)} unchanged (${rows.length} rows).`);
    return;
  }
  await writeFile(OUT, next, "utf8");
  console.log(`[seed] wrote ${path.relative(ROOT, OUT)} (${rows.length} rows).`);
}

main().catch((err) => {
  console.error(`[seed] ${String(err?.message ?? err)}`);
  process.exitCode = 1;
});
