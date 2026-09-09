"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AtlasSnapshot } from "@/lib/atlas/types";
import type { GlobePin } from "@/lib/atlas/globe";
import { buildIndex, subPinsFor, topLevelPins, zoomFor, type AtlasIndex } from "@/lib/atlas/data";
import AtlasGlobe, { type GlobeHandle } from "./AtlasGlobe";
import { DestinationPanel, ENQUIRE_URL, IntroPanel } from "./AtlasPanel";
import styles from "./Atlas.module.css";

const MOBILE_QUERY = "(max-width: 760px)";

/** The snapshot is a separate chunk so the shell paints before the content arrives. */
async function loadSnapshot(): Promise<AtlasSnapshot> {
  const mod = await import("../../../data/destinations.json");
  return mod.default as unknown as AtlasSnapshot;
}

export default function AtlasPage() {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const globeRef = useRef<GlobeHandle>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    loadSnapshot().then((snap) => {
      if (alive) setIndex(buildIndex(snap));
    });
    return () => {
      alive = false;
    };
  }, []);

  const pins = useMemo<GlobePin[]>(() => (index ? topLevelPins(index) : []), [index]);
  const topIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);

  const scrollPanel = useCallback(() => {
    const aside = asideRef.current;
    if (!aside) return;
    if (window.matchMedia(MOBILE_QUERY).matches) {
      // Globe stacks above the panel on small screens: bring the panel up.
      const top = aside.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      aside.scrollTo({ top: 0 });
    }
  }, []);

  const select = useCallback(
    (id: string) => {
      if (!index) return;
      const dest = index.byId.get(id);
      if (!dest) return;
      const g = globeRef.current;
      setSelectedId(id);
      if (g) {
        const subs = subPinsFor(dest, index, topIds);
        g.setSubPins(subs);
        const focusIds = [id, ...subs.map((p) => p.id), ...dest.childIds.filter((c) => topIds.has(c))];
        g.setFocus(focusIds);
        g.setSelected(id);
        if (dest.lat != null && dest.lon != null) g.flyTo(dest.lat, dest.lon, zoomFor(dest), dest.level >= 3 ? 1300 : 1500);
      }
      scrollPanel();
    },
    [index, topIds, scrollPanel]
  );

  const goHome = useCallback(() => {
    setSelectedId(null);
    const g = globeRef.current;
    if (g) {
      g.setSubPins([]);
      g.setFocus(null);
      g.reset();
    }
    if (asideRef.current && !window.matchMedia(MOBILE_QUERY).matches) asideRef.current.scrollTo({ top: 0 });
  }, []);

  const goBack = useCallback(() => {
    if (!index || !selectedId) return goHome();
    const dest = index.byId.get(selectedId);
    if (dest?.parentId) select(dest.parentId);
    else goHome();
  }, [index, selectedId, select, goHome]);

  // Deep link from other campaign pages: /2027-charter-season?destination=<id>
  // opens that destination once the content has loaded.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!index || deepLinked.current) return;
    deepLinked.current = true;
    const id = new URLSearchParams(window.location.search).get("destination");
    if (id && index.byId.has(id)) select(id);
  }, [index, select]);

  const selected = index && selectedId ? (index.byId.get(selectedId) ?? null) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header} id="atlas-header">
        <a href="https://www.oceanindependence.com" target="_blank" rel="noopener" className={styles.logoLink}>
          <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.logo} />
        </a>
        <div className={styles.headerMid}>
          <span className={styles.headerTitle}>THE 2027 CHARTER SEASON</span>
          <span className={styles.headerRule} />
          <span className={styles.headerSub}>Explore the world’s finest cruising grounds</span>
        </div>
        <a href={ENQUIRE_URL} target="_blank" rel="noopener" className={`${styles.btnOutline} ${styles.headerEnquire}`}>
          ENQUIRE
        </a>
      </header>

      <main className={styles.main}>
        <div className={styles.stage} id="atlas-left" data-screen-label="Globe">
          <AtlasGlobe ref={globeRef} className={styles.globe} pins={pins} onPinSelect={select} onDeselect={goHome} />
          <div className={styles.hint} id="atlas-hint">
            <span className={styles.hintDot} />
            <span className={styles.hintText}>DRAG TO TURN · SCROLL TO ZOOM · SELECT A DESTINATION</span>
          </div>
          <div className={styles.zoom} id="atlas-zoom">
            <button type="button" className={styles.zoomBtn} onClick={() => globeRef.current?.zoomBy(1.45)} aria-label="Zoom in">
              +
            </button>
            <span className={styles.zoomSep} />
            <button type="button" className={styles.zoomBtn} onClick={() => globeRef.current?.zoomBy(1 / 1.45)} aria-label="Zoom out">
              −
            </button>
          </div>
        </div>

        <aside className={styles.aside} id="atlas-aside" ref={asideRef}>
          {selected && index ? (
            <DestinationPanel dest={selected} index={index} onSelect={select} onBack={goBack} />
          ) : (
            <IntroPanel index={index} onSelect={select} />
          )}
        </aside>
      </main>
    </div>
  );
}
