/**
 * Image store selection — SERVER-ONLY.
 *
 * Two places yacht imagery can live:
 *
 *  - "blob": the original pipeline in fleet.mjs — Yachtfolio images cropped
 *    with sharp to two sizes and written to the public Blob IMAGES store.
 *    Pages published before the switch point at those URLs and keep working.
 *  - "sirv": one original per image uploaded to Sirv at
 *    /yachtfolio_images/<yfId>/<yfId>.<pos>.jpg and served through Sirv
 *    profiles, which do the cropping at request time.
 *
 * IMAGE_STORE picks the pipeline; "sirv" is honoured only when the Sirv
 * variables are all present, otherwise the app runs on Blob and says so once.
 */

const DEFAULT_ROOT_PATH = "/yachtfolio_images";
/**
 * Sirv profile names. Both profiles crop to fill 16:10 from the centre of the
 * image (charter-hero 2000 × 1250, charter-thumb 1000 × 625). The MYBA
 * watermark on Yachtfolio imagery sits at the centre of each photo, so a
 * centred crop always preserves it.
 */
const DEFAULT_PROFILE_HERO = "charter-hero";
const DEFAULT_PROFILE_THUMB = "charter-thumb";

/** The Sirv settings as configured, with defaults where the variable is optional. */
export function sirvConfig() {
  const baseUrl = (process.env.SIRV_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const rootPath = (process.env.SIRV_ROOT_PATH ?? "").trim() || DEFAULT_ROOT_PATH;
  return {
    clientId: process.env.SIRV_CLIENT_ID ?? "",
    clientSecret: process.env.SIRV_CLIENT_SECRET ?? "",
    baseUrl,
    rootPath: `/${rootPath.replace(/^\/+|\/+$/g, "")}`,
    profileHero: (process.env.SIRV_PROFILE_HERO ?? "").trim() || DEFAULT_PROFILE_HERO,
    profileThumb: (process.env.SIRV_PROFILE_THUMB ?? "").trim() || DEFAULT_PROFILE_THUMB,
  };
}

/** True when every variable Sirv needs (credentials and public origin) is present. */
export function sirvConfigured() {
  const c = sirvConfig();
  return Boolean(c.clientId && c.clientSecret && c.baseUrl);
}

let warned = false;

/**
 * "sirv" or "blob". Unset or anything but "sirv" means Blob. "sirv" without
 * the credentials also means Blob, with one warning per process so a
 * half-configured deployment is visible in the logs and in /api/health.
 */
export function getImageStore() {
  const wanted = String(process.env.IMAGE_STORE ?? "blob").trim().toLowerCase();
  if (wanted !== "sirv") return "blob";
  if (sirvConfigured()) return "sirv";
  if (!warned) {
    warned = true;
    console.warn("[image-store] IMAGE_STORE=sirv but SIRV_CLIENT_ID, SIRV_CLIENT_SECRET or SIRV_BASE_URL is missing — using the Blob image pipeline.");
  }
  return "blob";
}

/**
 * Public URL for a Sirv key. `variant` is "hero" or "thumb" (a profile is
 * applied) or "original" (the file as uploaded, no query).
 */
export function sirvImageUrl(key, variant = "hero") {
  const c = sirvConfig();
  const path = String(key ?? "").startsWith("/") ? key : `/${key}`;
  const base = `${c.baseUrl}${encodeURI(path)}`;
  if (variant === "original") return base;
  const profile = variant === "thumb" ? c.profileThumb : c.profileHero;
  return `${base}?profile=${encodeURIComponent(profile)}`;
}

/** What /api/health reports about the image store (no secrets). */
export function imageStoreDiagnostics() {
  const c = sirvConfig();
  return {
    imageStore: getImageStore(),
    imageStoreRequested: String(process.env.IMAGE_STORE ?? "blob").trim().toLowerCase() || "blob",
    sirvConfigured: sirvConfigured(),
    sirvRootPath: c.rootPath,
    sirvBaseUrl: c.baseUrl || null,
    sirvProfiles: { hero: c.profileHero, thumb: c.profileThumb },
  };
}
