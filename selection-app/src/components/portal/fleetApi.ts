/**
 * The portal form's client for the fleet API — shared by the Tier 3 and
 * Tier 2 forms.
 *
 *   GET  /api/fleet/:yfId                 specifications (never image work)
 *   POST /api/fleet/:yfId/images/prepare  start preparing images (returns at once)
 *   GET  /api/fleet/:yfId/images          read-only status, counts and URLs — polled
 *   POST /api/fleet/:yfId/refresh         refetch specifications and re-prepare images
 */

import type { FleetDetail, FleetImages } from "@/lib/portal-types";

export const IMAGE_POLL_MS = 3000;
/** Give up polling after this many ticks (two minutes) and say so. */
export const IMAGE_POLL_LIMIT = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(input: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? fallback);
  return body as T;
}

export const fetchDetail = (yfId: number) => call<FleetDetail>(`/api/fleet/${yfId}`, undefined, "Yachtfolio did not return this yacht's details.");
export const readImages = (yfId: number) => call<FleetImages>(`/api/fleet/${yfId}/images`, { cache: "no-store" }, "This yacht's images could not be read.");
export const startPrepare = (yfId: number) => call<FleetImages>(`/api/fleet/${yfId}/images/prepare`, { method: "POST" }, "This yacht's images could not be prepared.");
export const refreshYacht = (yfId: number) =>
  call<{ detail: FleetDetail; images: FleetImages }>(`/api/fleet/${yfId}/refresh`, { method: "POST" }, "This yacht could not be refreshed from Yachtfolio.");

/**
 * Poll the read-only images route every three seconds while the record says
 * "preparing". onTick receives each reading and returns false to stop early
 * (the pick was superseded). Resolves with the final reading, or null when
 * the job was still running after IMAGE_POLL_LIMIT ticks.
 */
export async function pollImages(yfId: number, onTick: (imgs: FleetImages) => boolean): Promise<FleetImages | null> {
  for (let i = 0; i < IMAGE_POLL_LIMIT; i++) {
    await sleep(IMAGE_POLL_MS);
    const imgs = await readImages(yfId);
    if (!onTick(imgs)) return imgs;
    if (imgs.status !== "preparing") return imgs;
  }
  return null;
}

/** "09 September 2026" — the house date format. */
export function fmtUpdated(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

/** The header note while images are being prepared: "Preparing images, 4 of 20". */
export function progressLabel(imgs: FleetImages | null | undefined): string {
  if (!imgs || imgs.status !== "preparing") return "Preparing images…";
  const ready = imgs.counts?.ready ?? imgs.gallery?.length ?? 0;
  const expected = imgs.counts?.expected;
  return expected ? `Preparing images, ${ready} of ${expected}` : "Preparing images…";
}

export const POLL_TIMEOUT_NOTE = "Images are still being prepared. They will appear when you next open this yacht, or use Refresh from Yachtfolio.";
export const staleNote = (iso: string | null | undefined) => `Showing details from ${fmtUpdated(iso) || "an earlier fetch"}; Yachtfolio could not be reached.`;
