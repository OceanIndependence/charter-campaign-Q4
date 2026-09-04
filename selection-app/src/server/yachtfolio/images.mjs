/**
 * Image geometry for the Tier 3 client page: every published image is
 * centre-cropped (fit cover — never stretched) to exactly 2000×1250 (16:10)
 * with a 1000×625 variant. Pure processing; callers decide where the
 * buffers are stored (disk for the build script, blob storage for the
 * on-demand fleet API).
 */

export const IMAGE_SIZES = [
  { suffix: "", width: 2000, height: 1250 },
  { suffix: "-sm", width: 1000, height: 625 },
];

/** Gallery categories published to the client page, in display order. */
export const GALLERY_ORDER = ["EXTERIOR", "LIFESTYLE", "INTERIOR"];

let sharpModule;
export async function loadSharp() {
  if (!sharpModule) {
    sharpModule = (await import("sharp")).default;
  }
  return sharpModule;
}

/**
 * Order a brochure's galleries EXTERIOR, LIFESTYLE, INTERIOR (by id_order
 * within each category), capped per category. Returns
 * [{ category, image, baseName }] with baseName like "01-exterior".
 */
export function selectGalleryImages(galleries, maxPerCategory = 4) {
  const selected = [];
  let seq = 0;
  for (const category of GALLERY_ORDER) {
    const images = [...(galleries?.[category] ?? [])].sort(
      (a, b) => (a.id_order ?? 0) - (b.id_order ?? 0)
    );
    for (const image of images.slice(0, maxPerCategory)) {
      seq += 1;
      selected.push({
        category,
        image,
        baseName: `${String(seq).padStart(2, "0")}-${category.toLowerCase()}`,
      });
    }
  }
  return selected;
}

/**
 * Crop one source image to every published size.
 * Returns [{ suffix, width, height, buffer }].
 */
export async function cropToSizes(sourceBuffer) {
  const sharp = await loadSharp();
  const out = [];
  for (const size of IMAGE_SIZES) {
    const buffer = await sharp(sourceBuffer)
      .resize(size.width, size.height, { fit: "cover", position: "centre", withoutEnlargement: false })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    out.push({ ...size, buffer });
  }
  return out;
}
