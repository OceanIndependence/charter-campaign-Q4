/**
 * Yachtfolio API client (doc v1.2) — SERVER-ONLY.
 *
 * Shared by the Next API routes and scripts/fetch-yachtfolio.mjs. The passkey
 * comes exclusively from the YACHTFOLIO_PASSKEY environment variable (or a
 * git-ignored .env.local when run as a script); it must never be returned to
 * a browser, written to disk or logged — pass any persisted/logged text
 * through redact() first.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Overridable only so the pipeline can be exercised against a local mock. */
export const API_BASE = process.env.YACHTFOLIO_API_BASE ?? "https://www.yachtfolio.com/api";

export const REQUEST_DELAY_MS = 400;
const RETRY_DELAY_MS = 1500;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve the passkey. `envFileRoots` (script use only) are directories whose
 * .env.local may define it; API routes rely on process.env alone.
 */
export async function loadPasskey(envFileRoots = []) {
  if (process.env.YACHTFOLIO_PASSKEY) return process.env.YACHTFOLIO_PASSKEY.trim();
  for (const root of envFileRoots) {
    const envFile = path.join(root, ".env.local");
    if (!existsSync(envFile)) continue;
    const text = await readFile(envFile, "utf8");
    const m = text.match(/^\s*YACHTFOLIO_PASSKEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}

/** Remove every occurrence of the passkey from text destined for disk/logs. */
export function redact(text, passkey) {
  return passkey ? String(text).split(passkey).join("<REDACTED>") : String(text);
}

/**
 * GET a Yachtfolio endpoint. Retries once on network failure, HTTP error or
 * a non-empty `errors` array; throws (with the passkey redacted) after that.
 * Returns { json, raw }.
 */
export async function apiGet(passkey, script, params) {
  const url = new URL(`${API_BASE}/${script}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("passkey", passkey);

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(raw);
      if (Array.isArray(json?.errors) && json.errors.length > 0) {
        throw new Error(`API errors: ${json.errors.join("; ")}`);
      }
      return { json, raw };
    } catch (err) {
      lastError = err;
      if (attempt === 1) await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error(
    `${script}?${redact(url.searchParams.toString(), passkey).replace(/passkey=[^&]*/, "passkey=…")} ` +
      `failed twice: ${redact(String(lastError?.message ?? lastError), passkey)}`
  );
}

/** Fetch the public charter fleet list: [{ id, name, registry_port }]. */
export async function fetchFleetList(passkey) {
  const { json } = await apiGet(passkey, "api_basic.cgi", { type: "list" });
  return [...json.data].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Fetch seasons + operating areas + equipments reference data. */
export async function fetchReferenceData(passkey) {
  const seasons = (await apiGet(passkey, "api_basic.cgi", { type: "seasons" })).json.data;
  await sleep(REQUEST_DELAY_MS);
  const operating_areas = (await apiGet(passkey, "api_basic.cgi", { type: "operating_areas_new" })).json.data;
  await sleep(REQUEST_DELAY_MS);
  const equipments = (await apiGet(passkey, "api_basic.cgi", { type: "equipments" })).json.data;
  return { seasons, operating_areas, equipments };
}

/** Fetch one yacht's brochure. Returns { json, raw } (raw for redacted samples). */
export function fetchBrochure(passkey, yfId) {
  return apiGet(passkey, "api_brochure.cgi", { id_yacht: yfId });
}

/** Fetch one yacht's basic record (fallback for anything the brochure lacks). */
export async function fetchBasicRecord(passkey, yfId) {
  const { json } = await apiGet(passkey, "api_basic.cgi", { type: "yachts", id_yacht: yfId });
  return Array.isArray(json.data) ? json.data[0] : json.data;
}
