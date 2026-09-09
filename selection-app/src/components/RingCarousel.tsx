"use client";

import { useEffect, useRef } from "react";
import type { Yacht } from "@/lib/types";
import { fmtCardRate, fmtLengthShort } from "@/lib/format";
import {
  ChevronIcon,
  CompareToggleIcon,
  GuestsIcon,
  LengthIcon,
  SpeakerIcon,
  StateroomsIcon,
} from "./icons";
import styles from "./RingCarousel.module.css";

/* Ring geometry (handoff spec): tilt 3°, R = 1.95 × cardW. The ring parent is
   lifted by R·sin(tilt)·0.9 and pushed back by R − 0.12·cardW; lengths live in
   CSS vars (--card-w/--card-h/--ring-r) so no JS measuring is needed. */
const TILT_DEG = 3;
const TILT_LIFT = Math.sin((TILT_DEG * Math.PI) / 180) * 0.9; // ≈ 0.0471

const SWIPE_PX = 55;
const DRAG_PX = 70;
const WHEEL_PX = 18;
const WHEEL_COOLDOWN_MS = 1000;

interface RingCarouselProps {
  /** Colour theme — changes card depth treatment (darken vs desaturate) */
  theme?: "dark" | "light";
  yachts: Yacht[];
  idx: number;
  mod: (v: number) => number;
  onNav: (d: number) => void;
  onGo: (i: number) => void;
  onFrontPick: () => void;
  compare: string[];
  compareEnabled: boolean;
  onToggleCompare: (id: string) => void;
  soundOn: boolean;
  onToggleSound: () => void;
}

export default function RingCarousel(props: RingCarouselProps) {
  const light = props.theme === "light";
  const { yachts, idx, mod, onNav, onGo, onFrontPick, compare, compareEnabled, soundOn } = props;
  const n = yachts.length;
  const step = 360 / n;
  const current = mod(idx);

  const stageRef = useRef<HTMLDivElement>(null);
  const navRef = useRef(onNav);
  navRef.current = onNav;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let tx = 0,
      ty = 0,
      tt = 0;
    const onTouchStart = (e: TouchEvent) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      tt = Date.now();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - tt < 900) {
        navRef.current(dx < 0 ? 1 : -1);
      }
    };

    let px = 0,
      dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        px = e.clientX;
        dragging = true;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - px;
      if (Math.abs(dx) > DRAG_PX) navRef.current(dx < 0 ? 1 : -1);
    };

    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > WHEEL_PX) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastWheel > WHEEL_COOLDOWN_MS) {
          lastWheel = now;
          navRef.current(e.deltaX > 0 ? 1 : -1);
        }
      }
    };

    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchend", onTouchEnd, { passive: true });
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("wheel", onWheel);
    };
  }, []);

  const ringTransform =
    `translateY(calc(var(--ring-r) * -${TILT_LIFT.toFixed(5)})) ` +
    `translateZ(calc((var(--ring-r) - var(--card-w) * 0.12) * -1)) ` +
    `rotateX(-${TILT_DEG}deg) rotateY(${-idx * step}deg)`;

  return (
    <div ref={stageRef} className={styles.stageWrap}>
      <div className={styles.progress}>
        <span className={styles.progressText}>
          {current + 1} OF {n} — {yachts[current].name}
        </span>
      </div>

      <div className={styles.stage}>
        <div className={styles.perspective}>
          <div className={styles.ring} style={{ transform: ringTransform }}>
            <div className={styles.floor} />
            {yachts.map((yacht, i) => {
              let o = (i - current + n) % n;
              if (o > n / 2) o -= n;
              const abs = Math.abs(o);
              const far = abs >= 3;
              const isFront = o === 0;
              const selected = compare.includes(yacht.id);
              return (
                <div
                  key={yacht.id}
                  className={styles.card}
                  style={{
                    transform: `rotateY(${i * step}deg) translateZ(var(--ring-r))`,
                    opacity: isFront ? 1 : far ? 0.3 : abs === 2 ? 0.55 : 0.8,
                    // Depth: dark cards darken as they recede; light cards
                    // desaturate instead and never darken.
                    filter: isFront
                      ? "none"
                      : light
                        ? far
                          ? "blur(3px) grayscale(0.4)"
                          : abs === 2
                            ? "grayscale(0.3)"
                            : "grayscale(0.15)"
                        : far
                          ? "blur(3px) brightness(0.45)"
                          : abs === 2
                            ? "brightness(0.55)"
                            : "brightness(0.65)",
                  }}
                  onClick={() => (isFront ? onFrontPick() : onGo(i))}
                  role="button"
                  aria-label={isFront ? `${yacht.name} — view specification` : `Rotate to ${yacht.name}`}
                >
                  {compareEnabled && (
                    <button
                      type="button"
                      className={`${styles.cmpBtn} ${selected ? styles.cmpBtnOn : ""}`}
                      style={{ pointerEvents: abs <= 1 ? "auto" : "none" }}
                      title="Add to comparison"
                      aria-pressed={selected}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onToggleCompare(yacht.id);
                      }}
                    >
                      <CompareToggleIcon selected={selected} />
                    </button>
                  )}
                  <div className={styles.cardBody}>
                    <div className={styles.cardImage}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={yacht.leadImageUrl} alt={yacht.name} className={styles.cardImg} />
                      <div className={styles.cardScrim}>
                        <div className={styles.cardName}>{yacht.name}</div>
                      </div>
                    </div>
                    {/* Light theme only (CSS): the name below the image fade. */}
                    <div className={styles.cardNameRow}>
                      <div className={styles.cardName}>{yacht.name}</div>
                    </div>
                    <div className={styles.statRow}>
                      {yacht.guests != null && (
                        <div className={styles.stat}>
                          <GuestsIcon />
                          <span className={styles.statValue}>{yacht.guests}</span>
                          <span className={styles.statLabel}>GUESTS</span>
                        </div>
                      )}
                      {yacht.staterooms && (
                        <div className={styles.stat}>
                          <StateroomsIcon />
                          <span className={styles.statValue}>{yacht.staterooms.count}</span>
                          <span className={styles.statLabel}>STATEROOMS</span>
                        </div>
                      )}
                      {yacht.lengthM != null && (
                        <div className={styles.stat}>
                          <LengthIcon />
                          <span className={styles.statValue}>{fmtLengthShort(yacht)}</span>
                          <span className={styles.statLabel}>LENGTH</span>
                        </div>
                      )}
                    </div>
                    <div className={styles.priceBlock}>
                      {yacht.weeklyRate != null && (
                        <div className={styles.price}>{fmtCardRate(yacht)}</div>
                      )}
                      {yacht.cruisingArea && (
                        <div className={styles.area}>LOCATION · {yacht.cruisingArea}</div>
                      )}
                    </div>
                    <div className={isFront ? styles.dashActive : styles.dash} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button type="button" className={styles.chevronLeft} onClick={() => onNav(-1)} aria-label="Previous yacht">
          <ChevronIcon dir="left" />
        </button>
        <button type="button" className={styles.chevronRight} onClick={() => onNav(1)} aria-label="Next yacht">
          <ChevronIcon dir="right" />
        </button>

        <button type="button" className={styles.soundToggle} onClick={props.onToggleSound}>
          <SpeakerIcon on={soundOn} />
          <span className={soundOn ? styles.soundLabelOn : styles.soundLabel}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </span>
        </button>
      </div>

      <div className={styles.dots} role="tablist" aria-label="Yacht selection">
        {yachts.map((yacht, i) => (
          <button
            key={yacht.id}
            type="button"
            className={styles.dot}
            role="tab"
            aria-selected={i === current}
            aria-label={yacht.name}
            onClick={() => onGo(i)}
          >
            <span className={i === current ? styles.dotBarActive : styles.dotBar} />
          </button>
        ))}
      </div>
    </div>
  );
}
