"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./EnlargeableImage.module.css";

/** Corner-brackets "expand" glyph. */
function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
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
  src: string;
  alt: string;
}

/**
 * A page photo with an enlarge affordance: renders the image plus a small
 * corner icon that opens the full-size image in a lightbox (closes on click
 * or Escape). Fills its positioned parent; render inside a relative container.
 */
export default function EnlargeableImage({ src, alt }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!src) return null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      <button
        type="button"
        className={styles.enlarge}
        onClick={() => setOpen(true)}
        aria-label="View this image larger"
        title="View larger"
      >
        <ExpandIcon />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label="Close preview"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.lightboxImg}
              src={src}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </>
  );
}
