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
/**
 * Back-off after a 429 or a rate-limit error body: three waits, then give
 * up with a RateLimitError. The passkey is shared with the overnight
 * Yachtfolio-to-CRM sync (800 calls per five minutes across both), so an
 * overlap must degrade into a slower catch-up, not a broken night.
 * (Overridable only so tests need not wait 40 seconds.)
 */
const RATE_LIMIT_DELAYS_MS = (process.env.YACHTFOLIO_RATE_LIMIT_DELAYS_MS ?? "2000,8000,30000").split(",").map(Number);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- accounting */

/**
 * Every call to Yachtfolio made through this module — API calls and media
 * (image) downloads alike — is counted here so a run can report exactly how
 * much of the shared allowance it used.
 */
const ops = { api: 0, media: 0, retries: 0, rateLimited: 0 };

/** Snapshot of the Yachtfolio call counters for this process. */
export function yachtfolioOps() {
  return { ...ops, total: ops.api + ops.media };
}

export function resetYachtfolioOps() {
  for (const k of Object.keys(ops)) ops[k] = 0;
}

/** Thrown once the back-off is spent; code "RATE_LIMIT" lets callers stop cleanly. */
export class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RateLimitError";
    this.code = "RATE_LIMIT";
  }
}

export const isRateLimitError = (err) => err?.code === "RATE_LIMIT";

const RATE_LIMIT_BODY = /rate.?limit|too many (requests|calls)|limit exceeded/i;

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
 * A 429, or an `errors` entry naming the rate limit, backs off 2 s, 8 s and
 * 30 s before a RateLimitError. Returns { json, raw }.
 */
export async function apiGet(passkey, script, params) {
  const url = new URL(`${API_BASE}/${script}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("passkey", passkey);
  const label = `${script}?${redact(url.searchParams.toString(), passkey).replace(/passkey=[^&]*/, "passkey=…")}`;

  let lastError;
  let limited = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      ops.api += 1;
      const res = await fetch(url);
      const raw = await res.text();
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
      const errors = Array.isArray(json?.errors) ? json.errors : [];
      if (res.status === 429 || errors.some((e) => RATE_LIMIT_BODY.test(String(e)))) {
        ops.rateLimited += 1;
        if (limited >= RATE_LIMIT_DELAYS_MS.length) throw new RateLimitError(`${label} rate-limited by Yachtfolio after ${limited} back-off wait(s).`);
        await sleep(RATE_LIMIT_DELAYS_MS[limited]);
        limited += 1;
        attempt -= 1; // a rate-limited call does not spend a retry
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (json === null) throw new Error("response was not JSON");
      if (errors.length > 0) throw new Error(`API errors: ${errors.join("; ")}`);
      return { json, raw };
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      lastError = err;
      if (attempt === 1) {
        ops.retries += 1;
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw new Error(`${label} failed twice: ${redact(String(lastError?.message ?? lastError), passkey)}`);
}

/**
 * Download a Yachtfolio media file (a gallery image; the URL carries the
 * passkey). Counted as a Yachtfolio call; a 429 backs off like apiGet.
 * Returns { bytes, contentType }.
 */
export async function fetchMedia(url, passkey) {
  let limited = 0;
  for (;;) {
    ops.media += 1;
    const res = await fetch(url);
    if (res.status === 429) {
      ops.rateLimited += 1;
      if (limited >= RATE_LIMIT_DELAYS_MS.length) throw new RateLimitError(`media download rate-limited by Yachtfolio after ${limited} back-off wait(s).`);
      await sleep(RATE_LIMIT_DELAYS_MS[limited]);
      limited += 1;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${redact(url, passkey)}`);
    return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "" };
  }
}

/** Fetch the public charter fleet list: [{ id, name, registry_port }]. */
export async function fetchFleetList(passkey) {
  const { json } = await apiGet(passkey, "api_basic.cgi", { type: "list" });
  return [...json.data].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * Fetch the basic record of every yacht in one call (the "yachts" type with
 * no id filter). Used by the nightly sync to carry each yacht's builder,
 * length and summer base port into the fleet list so the form's picker can
 * tell two yachts of the same name apart. Returns [] when the endpoint
 * answers with anything but a list.
 */
export async function fetchBasicList(passkey) {
  const { json } = await apiGet(passkey, "api_basic.cgi", { type: "yachts" });
  return Array.isArray(json?.data) ? json.data : [];
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
