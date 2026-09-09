"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AtlasPageConfig, AtlasPageDestination, AtlasPageYacht } from "@/lib/types";
import type { GlobePin } from "@/lib/atlas/globe";
import { countWord, fmtCardRate, fmtLengthShort } from "@/lib/format";
import AtlasGlobe, { type GlobeHandle } from "@/components/atlas/AtlasGlobe";
import SpecPanel from "@/components/SpecPanel";
import ConsultantBlock from "@/components/ConsultantBlock";
import EnlargeableImage from "@/components/EnlargeableImage";
import styles from "./Personalised.module.css";

/** Camera at rest: the Mediterranean, as in the design reference. */
const HOME = { lat: 40.2, lon: 12.6, zoom: 2.6 };
const CHOSEN_ZOOM = 3.6;
const OTHER_ZOOM = 2.2;

const firstName = (name: string) => (name.trim().split(/\s+/)[0] ?? "").trim();

/** "38M · 10 GUESTS · 5 STATEROOMS" */
function yachtMeta(y: AtlasPageYacht): string {
  const parts: string[] = [];
  const len = fmtLengthShort(y);
  if (len) parts.push(len);
  if (y.guests != null) parts.push(`${y.guests} GUESTS`);
  if (y.staterooms) parts.push(`${y.staterooms.count} ${y.staterooms.count === 1 ? "STATEROOM" : "STATEROOMS"}`);
  return parts.join(" · ");
}

function attribution(block: { source: "atlas" | "consultant" }, consultant: string): string {
  return block.source === "consultant" ? `CURATED FOR YOU BY ${consultant.toUpperCase()}` : "FROM THE 2027 ATLAS";
}

export default function PersonalisedAtlasPage({ config }: { config: AtlasPageConfig }) {
  const { destinations, yachts, consultant } = config;
  const consultantFirst = firstName(consultant.name) || consultant.name;
  const chosenIds = useMemo(() => destinations.map((d) => d.id), [destinations]);
  const byId = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  const otherById = useMemo(() => new Map(config.otherPins.map((p) => [p.id, p])), [config.otherPins]);

  /** Selected destination id (chosen or other Atlas pin), or null for the three-pin view. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Open drawer yacht index, or null. */
  const [drawer, setDrawer] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const globeRef = useRef<GlobeHandle>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);

  /* --------------------------------------------------------------- globe */

  const pins = useMemo<GlobePin[]>(() => {
    const chosen: GlobePin[] = destinations.map((d) => ({ id: d.id, name: d.name, lat: d.lat, lon: d.lon, featured: true, priority: true }));
    const others: GlobePin[] = config.otherPins
      .filter((p) => !byId.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, featured: false, priority: false }));
    return [...chosen, ...others];
  }, [destinations, config.otherPins, byId]);

  const globeOptions = useMemo(() => ({ drift: false, lockZoom: true, lockDrag: false, graticule: true }), []);

  const restGlobe = useCallback((dur = 1400) => {
    const g = globeRef.current;
    if (!g) return;
    g.setFocus(chosenIds);
    g.setSelected(null);
    g.flyTo(HOME.lat, HOME.lon, HOME.zoom, dur);
  }, [chosenIds]);

  const onGlobeReady = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    g.setFocus(chosenIds);
    g.flyTo(HOME.lat, HOME.lon, HOME.zoom, 1800);
  }, [chosenIds]);

  const scrollRailTo = useCallback((destId: string) => {
    const rail = railRef.current;
    if (!rail) return;
    const i = yachts.findIndex((y) => y.destinationIds.includes(destId));
    if (i < 0) return;
    const card = rail.children[i] as HTMLElement | undefined;
    if (card) rail.scrollTo({ left: card.offsetLeft - rail.offsetLeft, behavior: "smooth" });
  }, [yachts]);

  const scrollPanelTop = useCallback(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, []);

  /** A chosen destination: fly in, open its panel, bring its first yacht into view. */
  const selectDestination = useCallback(
    (id: string, focus: string[] = chosenIds) => {
      const d = byId.get(id);
      if (!d) return;
      setSelectedId(id);
      const g = globeRef.current;
      if (g) {
        g.setFocus(focus);
        g.setSelected(id);
        g.flyTo(d.lat, d.lon, CHOSEN_ZOOM, 1300);
      }
      scrollRailTo(id);
      scrollPanelTop();
    },
    [byId, chosenIds, scrollRailTo, scrollPanelTop]
  );

  /** Any other Atlas pin: "beyond the shortlist". */
  const selectOther = useCallback(
    (id: string) => {
      const p = otherById.get(id);
      if (!p) return;
      setSelectedId(id);
      const g = globeRef.current;
      if (g) {
        g.setFocus([...chosenIds, id]);
        g.setSelected(id);
        g.flyTo(p.lat, p.lon, OTHER_ZOOM, 1400);
      }
      scrollPanelTop();
    },
    [otherById, chosenIds, scrollPanelTop]
  );

  const onPinSelect = useCallback(
    (id: string) => {
      if (byId.has(id)) selectDestination(id);
      else selectOther(id);
    },
    [byId, selectDestination, selectOther]
  );

  const closePanel = useCallback(() => {
    setSelectedId(null);
    restGlobe();
  }, [restGlobe]);

  /* -------------------------------------------------------------- drawer */

  const openDrawer = useCallback(
    (i: number) => {
      const y = yachts[i];
      if (!y) return;
      setDrawer(i);
      const first = y.destinationIds.find((id) => byId.has(id));
      if (first) selectDestination(first, y.destinationIds.filter((id) => byId.has(id)));
    },
    [yachts, byId, selectDestination]
  );

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    const g = globeRef.current;
    if (g) g.setFocus(chosenIds);
  }, [chosenIds]);

  const stepDrawer = useCallback(
    (d: number) => {
      if (drawer === null) return;
      const n = yachts.length;
      const next = (((drawer + d) % n) + n) % n;
      setFading(true);
      window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => {
        openDrawer(next);
        setFading(false);
      }, 240);
    },
    [drawer, yachts.length, openDrawer]
  );

  useEffect(() => () => window.clearTimeout(fadeTimer.current), []);

  useEffect(() => {
    if (drawer === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
      if (e.key === "ArrowRight") stepDrawer(1);
      if (e.key === "ArrowLeft") stepDrawer(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer, closeDrawer, stepDrawer]);

  const scrollToRail = useCallback(() => {
    const el = document.getElementById("pa-rail");
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: "smooth" });
  }, []);

  /* -------------------------------------------------------------- render */

  const selectedDest = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedOther = selectedId && !selectedDest ? otherById.get(selectedId) ?? null : null;
  const panelOpen = Boolean(selectedDest || selectedOther);
  const drawerYacht = drawer !== null ? yachts[drawer] : null;
  const destCount = destinations.length;
  const railEyebrow = `${countWord(yachts.length)} ${yachts.length === 1 ? "YACHT" : "YACHTS"} ACROSS ${countWord(destCount)} ${destCount === 1 ? "DESTINATION" : "DESTINATIONS"}`;
  const introEyebrow = `PREPARED FOR ${config.clientNames.toUpperCase()} · SUMMER 2027`;
  const askHref = `mailto:${consultant.email}?subject=${encodeURIComponent("Summer 2027 options")}`;

  return (
    <div className={styles.page} data-theme="dark">
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.logo} />
        <span className={styles.headerLabel}>THE 2027 ATLAS · PERSONALISED</span>
      </header>

      <section className={styles.intro} data-screen-label="Intro">
        <div className={styles.eyebrow}>{introEyebrow}</div>
        <h1 className={styles.h1}>{config.clientGreeting}</h1>
        {config.introNote && (
          <p className={styles.introNote}>
            {config.introNote} — {consultantFirst}
          </p>
        )}
      </section>

      <section className={styles.globeSection} data-screen-label="Globe">
        <div className={styles.tabs} role="tablist" aria-label="Your three destinations">
          {destinations.map((d, i) => {
            const active = selectedId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${styles.tab} ${active ? styles.tabActive : ""}`}
                onClick={() => (active ? closePanel() : selectDestination(d.id))}
              >
                <span className={styles.tabNum}>{String(i + 1).padStart(2, "0")}</span>
                <span className={styles.tabName}>{d.name.toUpperCase()}</span>
              </button>
            );
          })}
        </div>

        <div className={`${styles.stage} ${panelOpen ? styles.stagePanelOpen : ""}`}>
          <AtlasGlobe
            ref={globeRef}
            className={styles.globe}
            pins={pins}
            options={globeOptions}
            home={HOME}
            onPinSelect={onPinSelect}
            onDeselect={closePanel}
            onReady={onGlobeReady}
          />
          <div className={styles.hint}>
            <span className={styles.hintDot} />
            <span className={styles.hintText}>{countWord(destCount)} DESTINATIONS, CHOSEN FOR YOU</span>
          </div>
          <div className={styles.zoom}>
            <button type="button" className={styles.zoomBtn} onClick={() => globeRef.current?.zoomBy(1.45)} aria-label="Zoom in">
              +
            </button>
            <span className={styles.zoomSep} />
            <button type="button" className={styles.zoomBtn} onClick={() => globeRef.current?.zoomBy(1 / 1.45)} aria-label="Zoom out">
              −
            </button>
          </div>

          <aside className={`${styles.panel} ${panelOpen ? styles.panelOpen : ""}`} ref={panelRef} aria-hidden={!panelOpen}>
            <button type="button" className={styles.panelClose} onClick={closePanel} aria-label="Close and return to your three destinations">
              ✕
            </button>
            {selectedDest && (
              <DestinationPanel
                key={selectedDest.id}
                dest={selectedDest}
                consultant={consultantFirst}
                onSeeYachts={() => {
                  scrollRailTo(selectedDest.id);
                  scrollToRail();
                }}
              />
            )}
            {selectedOther && (
              <div className={styles.panelInner} data-screen-label="Panel — Beyond the shortlist" key={selectedOther.id}>
                <div className={styles.eyebrow}>BEYOND THE SHORTLIST</div>
                <h3 className={styles.panelHeading}>{selectedOther.name.toUpperCase()}</h3>
                <p className={styles.otherBody}>
                  Not part of this shortlist, but if {selectedOther.name} appeals, {consultantFirst} can build it into your 2027 with the same care. The
                  full guide lives in the 2027 Atlas.
                </p>
                <a className={styles.textLink} href={`${config.atlasUrl}?destination=${encodeURIComponent(selectedOther.id)}`} target="_blank" rel="noopener">
                  EXPLORE IT IN THE ATLAS →
                </a>
                <div className={styles.panelFoot}>
                  <a className={styles.btnOutline} href={askHref}>
                    ASK {consultantFirst.toUpperCase()} ABOUT IT
                  </a>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className={styles.railSection} id="pa-rail" data-screen-label="Yacht rail">
        <div className={styles.railHead}>
          <div className={styles.eyebrow}>{railEyebrow}</div>
          <h2 className={styles.h2}>YOUR SHORTLIST</h2>
        </div>
        <div className={styles.rail} ref={railRef}>
          {yachts.map((y, i) => {
            const rate = fmtCardRate(y);
            const dim = Boolean(selectedDest) && !y.destinationIds.includes(selectedDest!.id);
            return (
              <button
                type="button"
                key={y.id}
                className={`${styles.card} ${y.knownYacht ? styles.cardKnown : ""} ${dim ? styles.cardDim : ""}`}
                onClick={() => openDrawer(i)}
                aria-label={`${y.name} — open details`}
              >
                <div className={styles.cardMedia}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {y.leadImageUrl && <img src={y.leadImageUrl} alt={`${y.name} — exterior profile`} loading="lazy" />}
                </div>
                <div className={styles.cardBody}>
                  {y.knownYacht && <div className={styles.cardKnownTag}>THE YACHT YOU KNOW</div>}
                  <div className={styles.cardName}>{y.name}</div>
                  <div className={styles.cardMeta}>{yachtMeta(y)}</div>
                  {rate && <div className={styles.cardRate}>{rate}</div>}
                  <div className={styles.chips}>
                    {y.destinationIds.map((id) => {
                      const d = byId.get(id);
                      return d ? (
                        <span key={id} className={`${styles.chip} ${selectedId === id ? styles.chipActive : ""}`}>
                          {d.name.toUpperCase()}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {config.seasonNote && (
        <section className={styles.seasonNote} data-screen-label="Season note">
          <div className={styles.seasonInner}>
            <div className={styles.eyebrow}>{config.seasonNote.eyebrow.toUpperCase()}</div>
            <p className={styles.seasonBody}>{config.seasonNote.body}</p>
          </div>
        </section>
      )}

      <ConsultantBlock consultant={consultant} atlasUrl={config.atlasUrl} />

      <div className={styles.disclaimer}>{config.footerDisclaimer}</div>

      {drawerYacht && (
        <div className={styles.drawerScrim} onClick={closeDrawer} role="presentation">
          <div
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={`${drawerYacht.name} details`}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className={styles.drawerClose} onClick={closeDrawer} aria-label="Close">
              ✕
            </button>
            <SpecPanel
              yacht={drawerYacht}
              position={drawer as number}
              count={yachts.length}
              fading={fading}
              onPrev={() => stepDrawer(-1)}
              onNext={() => stepDrawer(1)}
              signedBy={consultantFirst}
              vatText={drawerYacht.vatText}
              highlights={drawerYacht.highlights}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- destination */

function DestinationPanel({ dest, consultant, onSeeYachts }: { dest: AtlasPageDestination; consultant: string; onSeeYachts: () => void }) {
  return (
    <div className={styles.panelInner} data-screen-label={`Panel — ${dest.name}`}>
      {dest.eyebrow.value && <div className={styles.eyebrow}>{dest.eyebrow.value.toUpperCase()}</div>}
      <h3 className={styles.panelHeading}>{dest.name.toUpperCase()}</h3>
      {dest.deckLine.value && <div className={styles.deck}>{dest.deckLine.value}</div>}
      <div className={`${styles.attribution} ${dest.description.source === "consultant" ? styles.attributionMint : ""}`}>
        {attribution(dest.description, consultant)}
      </div>
      {dest.description.value && <p className={styles.description}>{dest.description.value}</p>}
      <button type="button" className={styles.textLink} onClick={onSeeYachts}>
        SEE THE YACHTS ↓
      </button>
      {dest.consultantNote?.value && (
        <p className={styles.note}>
          {dest.consultantNote.value} — {consultant}
        </p>
      )}
      <div className={styles.images}>
        {dest.images.map((img, i) =>
          img.value ? (
            <div className={styles.image} key={i}>
              <EnlargeableImage src={img.value} alt={`${dest.name} — ${i === 0 ? "first" : "second"} image`} />
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
