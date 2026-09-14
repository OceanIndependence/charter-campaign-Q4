/**
 * Sirv REST API client — SERVER-ONLY.
 *
 * The thin HTTP layer under the Sirv image pipeline: a bearer token cached in
 * module scope and refreshed before it expires, plus the five file commands
 * the pipeline needs. Endpoints and parameter names were confirmed against
 * https://apidocs.sirv.com/ on 11 September 2026:
 *
 *   POST /v2/token                      { clientId, clientSecret }  → { token, expiresIn }
 *   POST /v2/files/upload?filename=     raw bytes; parent folders are created implicitly
 *   POST /v2/files/delete?filename=     file or empty folder
 *   GET  /v2/files/stat?filename=
 *   GET  /v2/files/readdir?dirname=     100 entries a page, `continuation` for the next
 *
 * Every call is counted (see sirvOps) so a run can report what it cost
 * against Sirv's hourly limits (7,000 global, 2,000 uploads, 3,000 deletes).
 * The client secret is read from the environment at token time and never
 * appears in a log line or an error message.
 */

const DEFAULT_API_BASE = "https://api.sirv.com";
/** Refresh the token this long before Sirv says it expires. */
const TOKEN_SAFETY_MS = 60 * 1000;
/** Back-off before the second and third attempt on 429 or 5xx. */
const RETRY_DELAYS_MS = [2000, 8000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Overridable only so the client can be exercised against a local mock. */
export function sirvApiBase() {
  return (process.env.SIRV_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

/* ------------------------------------------------------------- accounting */

const ops = { calls: 0, tokens: 0, uploads: 0, deletes: 0, stats: 0, readdirs: 0, retries: 0 };

/** Snapshot of the Sirv call counters for this process. */
export function sirvOps() {
  return { ...ops };
}

export function resetSirvOps() {
  for (const k of Object.keys(ops)) ops[k] = 0;
}

/* ------------------------------------------------------------------ token */

let cachedToken = null; // { token, expiresAt }
let tokenInFlight = null;

export class SirvError extends Error {
  constructor(message, { status = 0, path = "", retryable = false } = {}) {
    super(message);
    this.name = "SirvError";
    this.status = status;
    this.path = path;
    this.retryable = retryable;
  }
}

function credentials() {
  const clientId = process.env.SIRV_CLIENT_ID;
  const clientSecret = process.env.SIRV_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SirvError("SIRV_CLIENT_ID and SIRV_CLIENT_SECRET are not configured on the server.");
  }
  return { clientId, clientSecret };
}

/** A short, secret-free description of a failed response for logs and errors. */
async function describeFailure(res) {
  let detail = "";
  try {
    detail = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
  } catch {
    detail = "";
  }
  return `HTTP ${res.status}${detail ? ` — ${detail}` : ""}`;
}

async function fetchToken() {
  const { clientId, clientSecret } = credentials();
  ops.calls += 1;
  ops.tokens += 1;
  const res = await fetch(`${sirvApiBase()}/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) {
    // The body of a failed token call is not read: it could echo the request.
    throw new SirvError(`Sirv token request failed: HTTP ${res.status}`, { status: res.status, path: "/v2/token", retryable: res.status === 429 || res.status >= 500 });
  }
  const json = await res.json();
  if (!json?.token) throw new SirvError("Sirv token response carried no token.", { path: "/v2/token" });
  const ttlMs = (Number(json.expiresIn) || 1200) * 1000;
  return { token: String(json.token), expiresAt: Date.now() + ttlMs };
}

/** The cached bearer token, fetched or refreshed when missing or near expiry. */
export async function getToken({ force = false } = {}) {
  if (!force && cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MS > Date.now()) return cachedToken.token;
  if (!tokenInFlight) {
    tokenInFlight = fetchToken()
      .then((t) => {
        cachedToken = t;
        return t.token;
      })
      .finally(() => {
        tokenInFlight = null;
      });
  }
  return tokenInFlight;
}

/** Forget the cached token (tests, or after a 401). */
export function resetToken() {
  cachedToken = null;
}

/* ---------------------------------------------------------------- request */

/**
 * One authenticated call with exponential back-off on 429 and 5xx (three
 * attempts in all) and a single token refresh on 401. Returns the Response
 * for the caller to interpret; throws SirvError once the attempts are spent.
 */
async function request(method, path, { query = {}, body, contentType } = {}) {
  const url = new URL(`${sirvApiBase()}${path}`);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  let refreshed = false;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const token = await getToken();
    const headers = { authorization: `Bearer ${token}` };
    if (contentType) headers["content-type"] = contentType;
    let res;
    try {
      ops.calls += 1;
      res = await fetch(url, { method, headers, body });
    } catch (err) {
      lastError = new SirvError(`Sirv ${method} ${path} failed: ${String(err?.message ?? err)}`, { path, retryable: true });
      res = null;
    }
    if (res) {
      if (res.status === 401 && !refreshed) {
        // A revoked or expired token: refresh once, without spending an attempt.
        refreshed = true;
        resetToken();
        await getToken({ force: true });
        attempt -= 1;
        continue;
      }
      if (res.status !== 429 && res.status < 500) return res;
      lastError = new SirvError(`Sirv ${method} ${path} failed: ${await describeFailure(res)}`, { status: res.status, path, retryable: true });
    }
    if (attempt < MAX_ATTEMPTS) {
      ops.retries += 1;
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
  }
  throw lastError ?? new SirvError(`Sirv ${method} ${path} failed.`, { path });
}

/* ------------------------------------------------------------------ files */

/** A Sirv path is absolute, forward-slashed, with no trailing slash. */
export function normaliseSirvPath(p) {
  const s = String(p ?? "").trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return s.startsWith("/") ? s : `/${s}`;
}

/**
 * Upload bytes to `path`, overwriting any file already there. Sirv creates
 * missing parent folders itself, so no mkdir is needed. Returns the path.
 */
export async function upload(path, bytes, contentType = "application/octet-stream") {
  const filename = normaliseSirvPath(path);
  ops.uploads += 1;
  const res = await request("POST", "/v2/files/upload", { query: { filename }, body: bytes, contentType });
  if (!res.ok) throw new SirvError(`Sirv upload of ${filename} failed: ${await describeFailure(res)}`, { status: res.status, path: filename });
  return filename;
}

/** Delete a file (or empty folder). Resolves false, without throwing, when it did not exist. */
export async function remove(path) {
  const filename = normaliseSirvPath(path);
  ops.deletes += 1;
  const res = await request("POST", "/v2/files/delete", { query: { filename } });
  if (res.status === 404) return false;
  if (!res.ok) throw new SirvError(`Sirv delete of ${filename} failed: ${await describeFailure(res)}`, { status: res.status, path: filename });
  return true;
}

/** File metadata from Sirv, or null when the path does not exist. */
export async function stat(path) {
  const filename = normaliseSirvPath(path);
  ops.stats += 1;
  const res = await request("GET", "/v2/files/stat", { query: { filename } });
  if (res.status === 404) return null;
  if (!res.ok) throw new SirvError(`Sirv stat of ${filename} failed: ${await describeFailure(res)}`, { status: res.status, path: filename });
  return res.json();
}

/**
 * Every entry directly under `dirname`, following continuation pages.
 * Returns [] for a folder that does not exist. Diagnostic use only — never
 * on a runtime path.
 */
export async function readdir(dirname) {
  const dir = normaliseSirvPath(dirname);
  const out = [];
  let continuation;
  do {
    ops.readdirs += 1;
    const res = await request("GET", "/v2/files/readdir", { query: { dirname: dir, continuation } });
    if (res.status === 404) return out;
    if (!res.ok) throw new SirvError(`Sirv readdir of ${dir} failed: ${await describeFailure(res)}`, { status: res.status, path: dir });
    const json = await res.json();
    out.push(...(Array.isArray(json?.contents) ? json.contents : []));
    continuation = json?.continuation || undefined;
  } while (continuation);
  return out;
}

/**
 * CDN purge — a documented no-op. Sirv invalidates every cached variant of a
 * file across its CDN within a few seconds of the file being overwritten or
 * deleted (help centre, "CDN file cache purge", read 11 September 2026), and
 * exposes no REST endpoint for a manual purge; the only manual purge is a
 * right-click in the Sirv file browser. Kept so the pipeline reads the same
 * whichever store is active.
 */
export async function purge(path) {
  return { path: normaliseSirvPath(path), purged: false, reason: "Sirv invalidates its CDN cache automatically on overwrite." };
}
