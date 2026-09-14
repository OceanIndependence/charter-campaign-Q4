/**
 * Live images for published pages — SERVER-ONLY.
 *
 * Specs are frozen at publish; images are live. A published page keeps the
 * specifications, rate and notes exactly as published, but its photographs
 * come from the yacht's current record at render time, so a photo replaced
 * in Yachtfolio (and re-prepared) shows on every page that uses it.
 *
 * The snapshot records, per image slot, the Yachtfolio image id the
 * consultant chose (imageRefs) and the URL at publish (imagesAtPublish, for
 * reference). At render each slot resolves to the current URL of that image
 * id on the record; an image that has since left the gallery falls back to
 * the record's default for that slot. A slot without a reference (a URL the
 * consultant pasted, or a page published before references existed) keeps
 * its stored URL. A yacht with no record keeps its stored URLs. A storage
 * failure propagates so the page can show a holding page instead of stale
 * or broken images.
 */

import { readYachtRecord } from "./yacht-records.mjs";
import { entryUrls, galleryOf } from "./image-store/sirv-pipeline.mjs";
import { defaultSlots } from "./yachtfolio/gallery.mjs";

const SLOTS = [
  ["lead", "leadImageUrl"],
  ["interior", "interiorImageUrl"],
  ["exterior", "exteriorImageUrl"],
  ["lifestyle", "lifestyleImageUrl"],
];

/** One yacht's slots resolved against its record; the yacht unchanged when there is nothing to resolve. */
export function resolveYachtImages(yacht, record) {
  if (!yacht?.imageRefs || !record?.images?.order?.length) return yacht;
  const gallery = galleryOf(record);
  const slots = defaultSlots(gallery, record.yfId);
  const byId = new Map(record.images.order.map((e) => [String(e.yfImageId), entryUrls(e).url]));
  const out = { ...yacht };
  for (const [slot, field] of SLOTS) {
    const ref = yacht.imageRefs[slot];
    if (ref == null) continue;
    out[field] = byId.get(String(ref)) ?? slots[field] ?? yacht[field];
  }
  return out;
}

/** The page config with every referenced yacht's images resolved from its current record. */
export async function resolveLiveImages(config) {
  const cache = new Map();
  const yachts = [];
  for (const stored of config?.yachts ?? []) {
    // The at-publish copy is reference only: it never reaches the browser.
    const { imagesAtPublish: _atPublish, ...y } = stored ?? {};
    const id = Number(y?.yachtfolioId);
    if (!Number.isInteger(id) || id <= 0 || !y.imageRefs) {
      yachts.push(y);
      continue;
    }
    if (!cache.has(id)) cache.set(id, await readYachtRecord(id));
    yachts.push(resolveYachtImages(y, cache.get(id)));
  }
  return { ...config, yachts };
}
