"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Yacht } from "@/lib/types";
import { FURTHER_BAND, LENGTH_BANDS, groupByBand } from "@/lib/fleet-bands";
import YachtCardBody from "@/components/YachtCardBody";
import SpecPanel from "@/components/SpecPanel";
import styles from "./Fleet.module.css";

export interface FleetPageYacht {
  yacht: Yacht;
  /** "From EUR 250,000 per week plus 35% APA plus VAT" or "Rate on application" */
  rateLine: string;
  /** Card form: "FROM EUR 250,000 + 35% APA + VAT" */
  rateLineShort: string;
  matchLevel: "specific" | "region";
}

interface Props {
  destination: { id: string; name: string; lede: string; heroImage: string | null };
  yachts: FleetPageYacht[];
  apaPct: number;
  /** Consultant attribution carried in from the incoming URL, if any */
  consultant: string | null;
  source: string;
  updatedAt: string;
}

const CONTACT = "https://www.oceanindependence.com/contact-us/";
const ATLAS = "/2027-charter-season";

/** Enquiry link: campaign UTMs plus the destination and yacht, preserving consultant attribution. */
export function enquiryHref(destinationId: string, destinationName: string, yachtName: string | null, consultant: string | null): string {
  const q = new URLSearchParams({
    utm_source: "atlas",
    utm_medium: "campaign",
    utm_campaign: "2027-charter-season",
    utm_content: destinationId,
    destination: destinationName,
  });
  if (yachtName) q.set("yacht", yachtName);
  if (consultant) q.set("consultant", consultant);
  return `${CONTACT}?${q.toString()}#enquiry-form`;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const countWords = (n: number) => (n < 10 ? WORDS[n] : String(n));

export default function FleetPage({ destination, yachts, consultant }: Props) {
  const [band, setBand] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<number | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);

  const groups = useMemo(() => groupByBand(yachts.map((f) => ({ ...f, lengthM: f.yacht.lengthM ?? null }))), [yachts]);
  const shownGroups = band ? groups.filter((g) => g.band.key === band) : groups;
  /** Flat list in display order, for the drawer's prev / next. */
  const flat = useMemo(() => shownGroups.flatMap((g) => g.yachts), [shownGroups]);
  const bandsPresent = new Set(groups.map((g) => g.band.key));

  const openDrawer = useCallback((i: number) => {
    setDrawer(i);
    setFading(false);
  }, []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const step = useCallback(
    (d: number) => {
      if (drawer === null || !flat.length) return;
      setFading(true);
      const next = (((drawer + d) % flat.length) + flat.length) % flat.length;
      window.setTimeout(() => {
        setDrawer(next);
        setFading(false);
      }, 240);
    },
    [drawer, flat.length]
  );

  useEffect(() => {
    if (drawer === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer, closeDrawer, step]);

  const current = drawer !== null ? flat[drawer] : null;
  const count = yachts.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="https://www.oceanindependence.com" target="_blank" rel="noopener" className={styles.logoLink}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.logo} />
        </a>
        <div className={styles.headerMid}>
          <span className={styles.headerTitle}>THE 2027 CHARTER SEASON</span>
          <span className={styles.headerRule} />
          <span className={styles.headerSub}>Yachts for charter</span>
        </div>
        <a href={enquiryHref(destination.id, destination.name, null, consultant)} target="_blank" rel="noopener" className={styles.btnOutline}>
          ENQUIRE
        </a>
      </header>

      <section className={styles.hero}>
        {destination.heroImage && (
          <div className={styles.heroMedia}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={destination.heroImage} alt="" />
          </div>
        )}
        <div className={styles.heroBody}>
          <a className={styles.back} href={`${ATLAS}?destination=${encodeURIComponent(destination.id)}`}>
            <span aria-hidden="true">←</span>&nbsp; BACK TO {destination.name.toUpperCase()} IN THE ATLAS
          </a>
          <div className={styles.eyebrow}>YACHTS FOR CHARTER</div>
          <h1 className={styles.h1}>{destination.name.toUpperCase()}</h1>
          {destination.lede && <p className={styles.lede}>{destination.lede}</p>}
          <div className={styles.count}>
            {count === 0 ? "NO YACHTS LISTED FOR THIS DESTINATION YET" : `${countWords(count).toUpperCase()} ${count === 1 ? "YACHT" : "YACHTS"} CRUISING ${destination.name.toUpperCase()} IN 2027`}
          </div>
        </div>
      </section>

      {count > 0 && (
        <div className={styles.filters} role="group" aria-label="Filter by length">
          <span className={styles.filterLabel}>LENGTH</span>
          <button type="button" className={`${styles.chip} ${band === null ? styles.chipOn : ""}`} onClick={() => setBand(null)}>
            ALL
          </button>
          {[...LENGTH_BANDS, FURTHER_BAND]
            .filter((b) => bandsPresent.has(b.key))
            .map((b) => (
              <button type="button" key={b.key} className={`${styles.chip} ${band === b.key ? styles.chipOn : ""}`} onClick={() => setBand(band === b.key ? null : b.key)}>
                {b.label.toUpperCase()}
              </button>
            ))}
        </div>
      )}

      <main className={styles.main}>
        {count === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyBody}>
              No yachts in the current fleet list their operating area as {destination.name}. Your consultant can suggest yachts positioned nearby for
              summer 2027.
            </p>
            <a className={styles.btnOutline} href={enquiryHref(destination.id, destination.name, null, consultant)} target="_blank" rel="noopener">
              ENQUIRE
            </a>
          </div>
        )}
        {shownGroups.map((g) => {
          const offset = flat.indexOf(g.yachts[0]);
          return (
            <section key={g.band.key} className={styles.band} id={`band-${g.band.key}`}>
              <div className={styles.bandHead}>
                <h2 className={styles.bandTitle}>{g.band.label.toUpperCase()}</h2>
                <span className={styles.bandCount}>
                  {countWords(g.yachts.length).toUpperCase()} {g.yachts.length === 1 ? "YACHT" : "YACHTS"}
                </span>
              </div>
              <div className={styles.grid}>
                {g.yachts.map((f, i) => (
                  <button type="button" key={f.yacht.id} className={styles.card} onClick={() => openDrawer(offset + i)} aria-label={`${f.yacht.name} — open details`}>
                    <YachtCardBody yacht={f.yacht} active rateLine={f.rateLineShort} />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <footer className={styles.footer}>
        <p className={styles.footNote}>
          Rates are the weekly minimum for summer 2027 in each yacht’s own currency, before APA and VAT. A yacht’s cruising area is set by her Owner
          ahead of the season and may change; your consultant will confirm availability for your dates.
        </p>
        <a className={styles.btnOutline} href={enquiryHref(destination.id, destination.name, null, consultant)} target="_blank" rel="noopener">
          ENQUIRE ABOUT {destination.name.toUpperCase()}
        </a>
      </footer>

      {current && (
        <div className={styles.drawerScrim} onClick={closeDrawer} role="presentation">
          <div className={styles.drawer} role="dialog" aria-modal="true" aria-label={`${current.yacht.name} details`} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.drawerClose} onClick={closeDrawer} aria-label="Close">
              ✕
            </button>
            <SpecPanel
              yacht={current.yacht}
              position={drawer as number}
              count={flat.length}
              fading={fading}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              rateLine={current.rateLine}
            />
            <div className={styles.drawerFoot}>
              <a className={styles.btnOutline} href={enquiryHref(destination.id, destination.name, current.yacht.name, consultant)} target="_blank" rel="noopener">
                ENQUIRE ABOUT {current.yacht.name}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
