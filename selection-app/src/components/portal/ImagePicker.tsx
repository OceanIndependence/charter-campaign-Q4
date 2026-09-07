"use client";

import type { GalleryImage } from "@/lib/portal-types";
import styles from "./PortalForm.module.css";

/**
 * The four page image slots the consultant fills from the yacht's gallery.
 * Each slot offers its own gallery category (lead and exterior from
 * EXTERIOR, interior from INTERIOR, lifestyle from LIFESTYLE); when that
 * category is empty it offers the other two instead.
 */
export const IMAGE_SLOTS = [
  { key: "leadImageUrl", label: "LEAD IMAGE", hint: "hero — 2000 × 1250", category: "EXTERIOR" },
  { key: "interiorImageUrl", label: "INTERIOR IMAGE", hint: "", category: "INTERIOR" },
  { key: "exteriorImageUrl", label: "EXTERIOR IMAGE", hint: "", category: "EXTERIOR" },
  { key: "lifestyleImageUrl", label: "LIFESTYLE IMAGE", hint: "", category: "LIFESTYLE" },
] as const;

export type SlotKey = (typeof IMAGE_SLOTS)[number]["key"];

/**
 * Most images shown per slot. Mirrors the server download cap; applied again
 * here so a draft saved before the cap changed (its gallery is only refreshed
 * on a re-pick) still shows the capped set.
 */
const MAX_PER_CATEGORY = 5;

/** Corner-brackets "expand" glyph — opens the image in the lightbox. */
function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  gallery: GalleryImage[];
  /** Current slot values on the draft yacht, keyed by slot key. */
  values: Record<SlotKey, string>;
  /** Assign a gallery image (or typed URL) to a slot. */
  onPick: (slot: SlotKey, url: string) => void;
  /** Open an image full-size in the lightbox. */
  onExpand: (url: string, label: string) => void;
}

export default function ImagePicker({ gallery, values, onPick, onExpand }: Props) {
  return (
    <div className={styles.pickerGroup}>
      {IMAGE_SLOTS.map((slot) => {
        const chosen = values[slot.key] ?? "";
        const capped = (cat: string) => gallery.filter((img) => img.category === cat).slice(0, MAX_PER_CATEGORY);
        const own = capped(slot.category);
        // No images in this slot's own category: offer the other categories
        // instead (the server will have picked one of them at random).
        const fallback = own.length === 0;
        const options = fallback
          ? ["EXTERIOR", "LIFESTYLE", "INTERIOR"].filter((c) => c !== slot.category).flatMap(capped)
          : own;
        const categoryWord = slot.category.toLowerCase();
        return (
          <div key={slot.key} className={styles.slotBlock}>
            <span className={styles.fieldLabel}>
              {slot.label}
              {slot.hint && <span className={styles.fieldLabelHint}> — {slot.hint}</span>}
            </span>

            {fallback && options.length > 0 && (
              <p className={styles.pickerEmpty}>
                Yachtfolio has no {categoryWord} images for this yacht — one of the other images was chosen; pick a
                different one below if you prefer.
              </p>
            )}
            {options.length > 0 ? (
              <div className={styles.thumbStrip}>
                {options.map((img) => {
                  const selected = chosen === img.url;
                  return (
                    <div
                      key={img.id}
                      className={`${styles.thumb} ${selected ? styles.thumbSelected : ""}`}
                    >
                      <button
                        type="button"
                        className={styles.thumbPick}
                        onClick={() => onPick(slot.key, img.url)}
                        aria-pressed={selected}
                        aria-label={`Use this ${categoryWord} image for ${slot.label.toLowerCase()}`}
                        title={`Use for ${slot.label.toLowerCase()}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.smallUrl} alt="" loading="lazy" />
                        {selected && <span className={styles.thumbCheck} aria-hidden="true">✓</span>}
                      </button>
                      <button
                        type="button"
                        className={styles.thumbExpand}
                        onClick={(e) => {
                          e.stopPropagation();
                          onExpand(img.url, `${slot.label} option`);
                        }}
                        aria-label="View this image larger"
                        title="View larger"
                      >
                        <ExpandIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.pickerEmpty}>
                {gallery.length > 0
                  ? "Yachtfolio has no images for this yacht — paste an image URL below."
                  : "Pick a yacht from the fleet to choose from its gallery, or paste an image URL below."}
              </p>
            )}

            <details className={styles.slotCustom}>
              <summary>Paste a custom image URL</summary>
              <input
                type="url"
                className={styles.input}
                placeholder="https://…  (overrides the gallery choice above)"
                value={chosen}
                onChange={(e) => onPick(slot.key, e.target.value)}
              />
            </details>
          </div>
        );
      })}
    </div>
  );
}
