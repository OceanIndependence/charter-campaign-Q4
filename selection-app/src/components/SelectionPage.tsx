"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageConfig } from "@/lib/types";
import { useSwoosh } from "@/lib/useSwoosh";
import Cover from "./Cover";
import RingCarousel from "./RingCarousel";
import SpecPanel from "./SpecPanel";
import { CompareBar, CompareOverlay } from "./Compare";
import { CostsSection, ItinerarySection } from "./CollapsibleSections";
import ConsultantBlock from "./ConsultantBlock";
import styles from "./SelectionPage.module.css";

const FADE_SWAP_MS = 480;

export default function SelectionPage({ config }: { config: PageConfig }) {
  const { yachts } = config;
  const n = yachts.length;

  /* Ring rotation state is a single unbounded integer index (mod n for
     display) so the ring always turns the short way. */
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const idxRef = useRef(0);
  const soundOnRef = useRef(false);
  const fadeTimer = useRef<number | undefined>(undefined);
  const playSwoosh = useSwoosh();
  soundOnRef.current = soundOn;

  const mod = useCallback((v: number) => ((v % n) + n) % n, [n]);

  const nav = useCallback(
    (d: number) => {
      const next = idxRef.current + d;
      idxRef.current = next;
      setIdx(next);
      setFading(true);
      if (soundOnRef.current) playSwoosh();
      window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => {
        setShown(mod(next));
        setFading(false);
      }, FADE_SWAP_MS);
    },
    [mod, playSwoosh]
  );

  const goTo = useCallback(
    (i: number) => {
      let delta = (i - mod(idxRef.current) + n) % n;
      if (delta === 0) return;
      if (delta > n / 2) delta -= n;
      nav(delta);
    },
    [mod, n, nav]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") nav(1);
      if (e.key === "ArrowLeft") nav(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  useEffect(() => () => window.clearTimeout(fadeTimer.current), []);

  const scrollToSpecs = useCallback(() => {
    const el = document.getElementById("ys-specs");
    if (el) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 24,
        behavior: "smooth",
      });
    }
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    setSoundOn(next);
    if (next) playSwoosh();
  }, [playSwoosh]);

  const toggleCompare = useCallback((id: string) => {
    setCompare((cmp) => {
      if (cmp.includes(id)) return cmp.filter((x) => x !== id);
      if (cmp.length >= 3) return cmp;
      return [...cmp, id];
    });
  }, []);

  const compareYachts = compare
    .map((id) => yachts.find((y) => y.id === id))
    .filter((y): y is NonNullable<typeof y> => Boolean(y));

  return (
    <div className={styles.page}>
      <Cover config={config} />

      <section className={styles.showcase}>
        <RingCarousel
          yachts={yachts}
          idx={idx}
          mod={mod}
          onNav={nav}
          onGo={goTo}
          onFrontPick={scrollToSpecs}
          compare={compare}
          compareEnabled={config.sections.compare}
          onToggleCompare={toggleCompare}
          soundOn={soundOn}
          onToggleSound={toggleSound}
        />
        <SpecPanel
          yacht={yachts[shown]}
          position={shown}
          count={n}
          fading={fading}
          onPrev={() => nav(-1)}
          onNext={() => nav(1)}
        />
      </section>

      {config.sections.compare && !compareOpen && compareYachts.length > 0 && (
        <CompareBar
          yachts={compareYachts}
          onOpen={() => compareYachts.length >= 2 && setCompareOpen(true)}
          onClear={() => setCompare([])}
        />
      )}
      {config.sections.compare && compareOpen && (
        <CompareOverlay yachts={compareYachts} onClose={() => setCompareOpen(false)} />
      )}

      {config.sections.costs && <CostsSection />}
      {config.sections.itinerary && <ItinerarySection itineraryUrl={config.sections.itineraryUrl} />}

      <ConsultantBlock consultant={config.consultant} atlasUrl={config.atlasUrl} />

      <div className={styles.disclaimer}>
        These vessels are offered subject to change, price change, and owners&rsquo; final approval.
      </div>

      <footer className={styles.footer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.footerLogo} />
        <span className={styles.footerTagline}>SHAPING THE FUTURE OF YACHTING</span>
      </footer>
    </div>
  );
}
