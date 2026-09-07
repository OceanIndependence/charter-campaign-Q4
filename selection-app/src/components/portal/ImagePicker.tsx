"use client";

import type { GalleryImage } from "@/lib/portal-types";
import styles from "./PortalForm.module.css";

/** The four page image slots the consultant fills from the yacht's gallery. */
export const IMAGE_SLOTS = [
  { key: "leadImageUrl", label: "LEAD IMAGE", hint: "hero — 2000 × 1250", order: ["EXTERIOR", "LIFESTYLE", "INTERIOR"] },
  { key: "interiorImageUrl", label: "INTERIOR IMAGE", hint: "", order: ["INTERIOR", "LIFESTYLE", "EXTERIOR"] },
  { key: "deckImageUrl", label: "DECK IMAGE", hint: "", order: ["EXTERIOR", "LIFESTYLE", "INTERIOR"] },
  { key: "watertoysImageUrl", label: "WATERTOYS IMAGE", hint: "", order: ["LIFESTYLE", "EXTERIOR", "INTERIOR"] },
] as const;

export type SlotKey = (typeof IMAGE_SLOTS)[number]["key"];

const CAT_TAG: Record<string, string> = { EXTERIOR: "EXT", LIFESTYLE: "LIFE", INTERIOR: "INT" };

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

/**
 * Most images shown per category. Mirrors the server download cap; applied
 * again here so a draft saved before the cap changed (its gallery is only
 * refreshed on a re-pick) still shows the capped set.
 */
const MAX_PER_CATEGORY = 5;

/**
 * Order a gallery for a slot: its natural categories first, position
 * preserved within each, and at most MAX_PER_CATEGORY of each category.
 */
function orderFor(gallery: GalleryImage[], order: readonly string[]): GalleryImage[] {
  const rank = (c: string) => {
    const i = order.indexOf(c);
    return i === -1 ? order.length : i;
  };
  const perCategory = new Map<string, number>();
  return gallery
    .filter((img) => {
      const n = (perCategory.get(img.category) ?? 0) + 1;
      perCategory.set(img.category, n);
      return n <= MAX_PER_CATEGORY;
    })
    .map((img, i) => ({ img, i }))
    .sort((a, b) => rank(a.img.category) - rank(b.img.category) || a.i - b.i)
    .map((x) => x.img);
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
        const ordered = orderFor(gallery, slot.order);
        return (
          <div key={slot.key} className={styles.slotBlock}>
            <span className={styles.fieldLabel}>
              {slot.label}
              {slot.hint && <span className={styles.fieldLabelHint}> — {slot.hint}</span>}
            </span>

            {gallery.length > 0 ? (
              <div className={styles.thumbStrip}>
                {ordered.map((img) => {
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
                        aria-label={`Use this ${img.category.toLowerCase()} image for ${slot.label.toLowerCase()}`}
                        title={`Use for ${slot.label.toLowerCase()}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.smallUrl} alt="" loading="lazy" />
                        <span className={styles.thumbTag}>{CAT_TAG[img.category] ?? img.category}</span>
                        {selected && <span className={styles.thumbCheck} aria-hidden="true">✓</span>}
                      </button>
                      <button
                        type="button"
                        className={styles.thumbExpand}
                        onClick={(e) => {
                          e.stopPropagation();
                          onExpand(img.url, `${CAT_TAG[img.category] ?? img.category}`);
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
                Pick a yacht from the fleet to choose from its gallery, or paste an image URL below.
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
