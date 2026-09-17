"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DestinationsPageConfig, DestinationsPageDestination, DestinationsPageYacht } from "@/lib/types";
import type { GlobePin, RoutePoint } from "@/lib/atlas/globe";
import type { DestinationsPageItinerary, DestinationsPageStop, Consultant } from "@/lib/types";
import { contactCta } from "@/lib/format";
import { countWord, fmtCardRate, fmtCardTotal, fmtLengthShort } from "@/lib/format";
import AtlasGlobe, { type GlobeHandle } from "@/components/atlas/AtlasGlobe";
import { SHOW_OTHER_PINS } from "@/lib/atlas/tier2-other-pins";
import SpecPanel from "@/components/SpecPanel";
import ConsultantBlock from "@/components/ConsultantBlock";
import EnlargeableImage from "@/components/EnlargeableImage";
import { CompareBar, CompareOverlay } from "@/components/Compare";
import { CostsSection, ItinerarySection } from "@/components/CollapsibleSections";
import { CompareToggleIcon, SmallChevronIcon } from "@/components/icons";
import styles from "./Destinations.module.css";

/** Camera at rest: the Mediterranean, as in the design reference. */
const HOME = { lat: 40.2, lon: 12.6, zoom: 2.6 };
const CHOSEN_ZOOM = 3.6;
const OTHER_ZOOM = 2.2;
/** The globe may fly down to a single anchorage on a route (the Atlas stops at 8). */
const ZOOM_MAX = 80;
/** The side panel's width, as in the design: min(460px, 88vw). */
const PANEL_PX = 460;
const PANEL_VW = 0.88;
/** Below this width the panel's cover of the stage is compensated with a view shift. */
const SHIFT_STAGE_MIN = 560;
/** At or below this width the panel is a bottom sheet (see the module CSS), so no shift. */
const SHEET_MAX = 420;
/** Route pins are keyed by stop index with this prefix. */
const STOP_PIN = "st-";

/**
 * Camera to fit a route: centred on the stops, zoom from their angular span
 * (clamped 4–34), as in the design prototype.
 */
function fitRoute(points: Array<{ lat: number; lon: number }>) {
  let lat = 0;
  let lon = 0;
  let latMin = 90;
  let latMax = -90;
  let lonMin = 180;
  let lonMax = -180;
  for (const s of points) {
    lat += s.lat;
    lon += s.lon;
    latMin = Math.min(latMin, s.lat);
    latMax = Math.max(latMax, s.lat);
    lonMin = Math.min(lonMin, s.lon);
    lonMax = Math.max(lonMax, s.lon);
  }
  lat /= points.length;
  lon /= points.length;
  const d2r = Math.PI / 180;
  const span = Math.max((latMax - latMin) * d2r, (lonMax - lonMin) * d2r * Math.cos(lat * d2r), 0.008);
  return { lat, lon, zoom: Math.max(4, Math.min(34, 1.15 / span)) };
}

/** "SEVEN DAYS" — from the website's own day count. */
function itineraryEyebrow(it: DestinationsPageItinerary): string {
  const n = it.days || it.stops.length;
  return `${countWord(n)} ${n === 1 ? "DAY" : "DAYS"}`.toUpperCase();
}

/** Place names as the website writes them vary in case; they are names, so they are capitalised. */
const titleCase = (s: string) => s.replace(/(^|[\s'\u2019-])([a-z\u00e0-\u00ff])/g, (_, pre, ch) => pre + ch.toUpperCase());

/** "Rome · Ponza · Ischia · Capri": where each day ends, consecutive repeats dropped. */
function stopsLine(it: DestinationsPageItinerary): string {
  const names: string[] = [];
  for (const s of it.stops) {
    const end = s.points[s.points.length - 1]?.name;
    if (end && names[names.length - 1]?.toLowerCase() !== end.toLowerCase()) names.push(titleCase(end));
  }
  return names.join(" · ");
}

/** Where a day ends: its last located place, or null when none could be located. */
const dayEnd = (s: DestinationsPageStop) => s.points[s.points.length - 1] ?? null;

/** Every located place along the route, in order, consecutive repeats dropped. */
function routeOf(it: DestinationsPageItinerary): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const s of it.stops) {
    for (const p of s.points) {
      const last = out[out.length - 1];
      if (last && last.lat === p.lat && last.lon === p.lon) continue;
      out.push({ lat: p.lat, lon: p.lon, day: s.day, place: p.name });
    }
  }
  return out;
}

/** "DAY 1" or "DAYS 1–3". */
const dayLabel = (s: DestinationsPageStop) => (s.dayEnd ? `DAYS ${s.day}–${s.dayEnd}` : `DAY ${s.day}`);

const stopPinId = (i: number) => `${STOP_PIN}${i}`;

const firstName = (name: string) => (name.trim().split(/\s+/)[0] ?? "").trim();

/** A brochure link the consultant actually filled in ("#" is the blank the mapping writes). */
const hasBrochure = (y: DestinationsPageYacht) => Boolean(y.brochureUrl && y.brochureUrl !== "#");

/**
 * "38M · SUNSEEKER · 10 GUESTS · 5 STATEROOMS" as segments. A missing value
 * drops its segment, so the separators never double or trail. The builder is
 * capitalised here to match the rest of the line; the drawer shows it as
 * stored.
 */
function yachtMetaSegments(y: DestinationsPageYacht): string[] {
  const parts: string[] = [];
  const len = fmtLengthShort(y);
  if (len) parts.push(len);
  if (y.builder) parts.push(y.builder.toUpperCase());
  if (y.guests != null) parts.push(`${y.guests} GUESTS`);
  if (y.staterooms) parts.push(`${y.staterooms.count} ${y.staterooms.count === 1 ? "STATEROOM" : "STATEROOMS"}`);
  return parts;
}

/**
 * The stat line: each segment (with its trailing middot) is unbreakable, the
 * line wraps only between segments and is clamped to two lines, so a long
 * builder never splits mid-name and never pushes the card to a third line.
 */
function YachtMeta({ yacht }: { yacht: DestinationsPageYacht }) {
  const segments = yachtMetaSegments(yacht);
  if (!segments.length) return null;
  return (
    <div className={styles.cardMeta}>
      {segments.map((segment, i) => (
        <span key={segment}>
          {i > 0 ? " " : null}
          <span className={styles.cardMetaSeg}>
            {segment}
            {i < segments.length - 1 ? " ·" : ""}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function DestinationsPage({ config }: { config: DestinationsPageConfig }) {
  const { destinations, yachts, consultant } = config;
  const theme = config.theme === "light" ? "light" : "dark";
  // Pages published before the form had a Page Sections card carry no block
  // and render exactly as they were published: neither section.
  const compareEnabled = config.sections?.compare === true;
  const costsEnabled = config.sections?.costs === true;
  const itineraryEnabled = config.sections?.itinerary === true;
  // "" when the consultant is inactive: no signatures, no "ask" button, no block.
  const consultantFirst = consultant ? firstName(consultant.name) || consultant.name : "";
  const chosenIds = useMemo(() => destinations.map((d) => d.id), [destinations]);
  const byId = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  // With SHOW_OTHER_PINS off there is no "beyond the shortlist" pin to open,
  // so the map stays empty and that branch of the panel never renders.
  const otherById = useMemo(
    () => new Map(SHOW_OTHER_PINS ? config.otherPins.map((p) => [p.id, p] as const) : []),
    [config.otherPins]
  );

  /** Selected destination id (chosen or other Atlas pin), or null for the three-pin view. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The open sample itinerary (destination id and index), or null for the destination view. */
  const [itin, setItin] = useState<{ destId: string; index: number } | null>(null);
  /** The selected stop on the open itinerary, or null. */
  const [stop, setStop] = useState<number | null>(null);
  /** Open drawer yacht index, or null. */
  const [drawer, setDrawer] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const globeRef = useRef<GlobeHandle>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<number | undefined>(undefined);

  // The page root carries the theme for its own tokens; the document root
  // carries it too so html/body background and scrollbars follow.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  /* ------------------------------------------------------------- compare */

  /** Yacht ids ticked for comparison, in the order they were ticked (up to three). */
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleCompare = useCallback((id: string) => {
    setCompare((cmp) => {
      if (cmp.includes(id)) return cmp.filter((x) => x !== id);
      if (cmp.length >= 3) return cmp;
      return [...cmp, id];
    });
  }, []);

  const compareYachts = useMemo(
    () => compare.map((id) => yachts.find((y) => y.id === id)).filter((y): y is DestinationsPageYacht => Boolean(y)),
    [compare, yachts]
  );

  /* --------------------------------------------------------------- globe */

  const pins = useMemo<GlobePin[]>(() => {
    const chosen: GlobePin[] = destinations.map((d) => ({ id: d.id, name: d.name, lat: d.lat, lon: d.lon, featured: true, priority: true }));
    // The dimmed Atlas pins around the shortlist are off for now: the globe
    // shows the consultant's chosen destinations only. See tier2-other-pins.ts.
    const others: GlobePin[] = SHOW_OTHER_PINS
      ? config.otherPins
          .filter((p) => !byId.has(p.id))
          .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, featured: false, priority: false }))
      : [];
    return [...chosen, ...others];
  }, [destinations, config.otherPins, byId]);

  const globeOptions = useMemo(() => ({ drift: false, lockZoom: true, lockDrag: false, graticule: true }), []);
  const routesEnabled = config.sections?.routes !== false;

  const openItinerary_ = useMemo(() => {
    if (!itin) return null;
    return byId.get(itin.destId)?.itineraries?.[itin.index] ?? null;
  }, [itin, byId]);

  /** Take any drawn route and its stop pins off the globe. */
  const clearRoute = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    g.setSubPins([]);
    g.setRoute(null);
  }, []);

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

  /* ---------------------------------------------------------- rail chevrons */

  /** Which ends of the rail are reached, so the chevrons can dim at the limits. */
  const [railEnds, setRailEnds] = useState({ start: true, end: true });

  const syncRailEnds = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setRailEnds({ start: rail.scrollLeft <= 1, end: rail.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    syncRailEnds();
    rail.addEventListener("scroll", syncRailEnds, { passive: true });
    window.addEventListener("resize", syncRailEnds);
    return () => {
      rail.removeEventListener("scroll", syncRailEnds);
      window.removeEventListener("resize", syncRailEnds);
    };
  }, [syncRailEnds, yachts.length]);

  /** One card per press; the rail snaps to the card edge. */
  const stepRail = useCallback((d: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const first = rail.children[0] as HTMLElement | undefined;
    const second = rail.children[1] as HTMLElement | undefined;
    const step = first && second ? second.offsetLeft - first.offsetLeft : rail.clientWidth * 0.8;
    rail.scrollBy({ left: step * d, behavior: "smooth" });
  }, []);

  /** A chosen destination: fly in, open its panel, bring its first yacht into view. */
  const selectDestination = useCallback(
    (id: string, focus: string[] = chosenIds) => {
      const d = byId.get(id);
      if (!d) return;
      setSelectedId(id);
      setItin(null);
      setStop(null);
      clearRoute();
      const g = globeRef.current;
      if (g) {
        g.setFocus(focus);
        g.setSelected(id);
        g.flyTo(d.lat, d.lon, CHOSEN_ZOOM, 1300);
      }
      scrollRailTo(id);
      scrollPanelTop();
    },
    [byId, chosenIds, clearRoute, scrollRailTo, scrollPanelTop]
  );

  /* ---------------------------------------------------------- itineraries */

  /** A sample itinerary: swap the panel body, draw the route and fit the camera to it. */
  const openItinerary = useCallback(
    (destId: string, index: number) => {
      const it = byId.get(destId)?.itineraries?.[index];
      if (!it) return;
      setItin({ destId, index });
      setStop(null);
      scrollPanelTop();
      const g = globeRef.current;
      if (!g) return;
      // One pin per day, at the place where the day ends; the route runs
      // through every located place, so a leg's departure is drawn too. A day
      // whose places could not be located carries no pin.
      const pins: GlobePin[] = it.stops.flatMap((s, i) => {
        const end = dayEnd(s);
        return end ? [{ id: stopPinId(i), name: end.name, lat: end.lat, lon: end.lon, featured: false }] : [];
      });
      g.setSubPins(pins);
      g.setRoute(routeOf(it));
      g.setFocus(pins.map((p) => p.id));
      g.setSelected(null);
      const f = fitRoute(it.stops.flatMap((s) => s.points));
      g.flyTo(f.lat, f.lon, f.zoom, 1500);
    },
    [byId, scrollPanelTop]
  );

  /** Back to the destination: route off, destination pinned and framed again. */
  const closeItinerary = useCallback(() => {
    const destId = itin?.destId;
    setItin(null);
    setStop(null);
    clearRoute();
    scrollPanelTop();
    const d = destId ? byId.get(destId) : null;
    const g = globeRef.current;
    if (g && d) {
      g.setFocus(chosenIds);
      g.setSelected(d.id);
      g.flyTo(d.lat, d.lon, CHOSEN_ZOOM, 1300);
    }
  }, [itin, byId, chosenIds, clearRoute, scrollPanelTop]);

  /** A stop: about twice as close as the route fit, so its coastline fills the frame. */
  const selectStop = useCallback(
    (i: number) => {
      const it = openItinerary_;
      const s = it?.stops[i];
      if (!it || !s) return;
      const end = dayEnd(s);
      if (!end) return;
      setStop(i);
      const g = globeRef.current;
      if (!g) return;
      g.setSelected(stopPinId(i));
      const f = fitRoute(it.stops.flatMap((x) => x.points));
      g.flyTo(end.lat, end.lon, Math.min(48, Math.max(18, f.zoom * 2.2)), 1250);
    },
    [openItinerary_]
  );

  /** Ocean tapped: a selected stop is released and the route re-fitted; otherwise the panel closes. */
  const deselectStop = useCallback(() => {
    const it = openItinerary_;
    if (!it) return false;
    setStop(null);
    const g = globeRef.current;
    if (g) {
      g.setSelected(null);
      const f = fitRoute(it.stops.flatMap((x) => x.points));
      g.flyTo(f.lat, f.lon, f.zoom, 1200);
    }
    return true;
  }, [openItinerary_]);

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
      if (id.startsWith(STOP_PIN)) selectStop(Number(id.slice(STOP_PIN.length)));
      else if (byId.has(id)) selectDestination(id);
      else selectOther(id);
    },
    [byId, selectDestination, selectOther, selectStop]
  );

  const closePanel = useCallback(() => {
    setSelectedId(null);
    setItin(null);
    setStop(null);
    clearRoute();
    restGlobe();
  }, [clearRoute, restGlobe]);

  /** The globe's empty-ocean tap: releases a stop while a route is open, else closes the panel. */
  const onGlobeDeselect = useCallback(() => {
    if (itin) {
      if (stop !== null) deselectStop();
      return;
    }
    closePanel();
  }, [itin, stop, deselectStop, closePanel]);

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

  /* ----------------------------------------------------------- view shift */

  const stageRef = useRef<HTMLDivElement>(null);
  const selectedDest = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedOther = selectedId && !selectedDest ? otherById.get(selectedId) ?? null : null;
  const panelOpen = Boolean(selectedDest || selectedOther);

  // The side panel covers the right of the stage. Where the uncovered part is
  // narrow (< 560px) the globe's projection window is shifted by half the
  // panel width, so a route or a pin is framed in the visible part rather than
  // behind the panel; cleared when the panel closes. Re-evaluated on resize.
  // The bottom-sheet layout (≤ 420px) covers no width, so it never shifts.
  useEffect(() => {
    const apply = () => {
      const g = globeRef.current;
      const stage = stageRef.current;
      if (!g || !stage) return;
      const vw = window.innerWidth;
      const pw = Math.min(PANEL_PX, vw * PANEL_VW);
      const shift = panelOpen && vw > SHEET_MAX && stage.clientWidth - pw < SHIFT_STAGE_MIN ? pw / 2 : 0;
      g.setViewShift(shift);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [panelOpen]);

  const scrollToRail = useCallback(() => {
    const el = document.getElementById("pa-rail");
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: "smooth" });
  }, []);

  /* -------------------------------------------------------------- render */

  const drawerYacht = drawer !== null ? yachts[drawer] : null;
  const destCount = destinations.length;
  const railEyebrow = `${countWord(yachts.length)} ${yachts.length === 1 ? "YACHT" : "YACHTS"} ACROSS ${countWord(destCount)} ${destCount === 1 ? "DESTINATION" : "DESTINATIONS"}`;
  const introEyebrow = `PREPARED FOR ${config.clientNames.toUpperCase()} · SUMMER 2027`;
  const askHref = consultant?.email ? `mailto:${consultant.email}?subject=${encodeURIComponent("Summer 2027 options")}` : null;

  return (
    <div className={styles.page} data-theme={theme}>
      {/* The header stays dark on both themes, as on the Yacht Selection page. */}
      <header className={styles.header} data-theme="dark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.logo} />
        <span className={styles.headerLabel}>PERSONALISED FOR YOU</span>
      </header>

      <section className={styles.intro} data-screen-label="Intro">
        <div className={styles.eyebrow}>{introEyebrow}</div>
        <h1 className={styles.h1}>{config.clientGreeting}</h1>
        {config.introNote && (
          <p className={styles.introNote}>
            {config.introNote}
            {consultantFirst && ` — ${consultantFirst}`}
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

        <div className={`${styles.stage} ${panelOpen ? styles.stagePanelOpen : ""}`} ref={stageRef}>
          <AtlasGlobe
            ref={globeRef}
            className={styles.globe}
            pins={pins}
            options={globeOptions}
            home={HOME}
            zoomMax={ZOOM_MAX}
            onPinSelect={onPinSelect}
            onDeselect={onGlobeDeselect}
            onReady={onGlobeReady}
          />
          {/* The instruction is stale once a destination is open, and it would
              collide with the shifted zoom cluster: it fades out and is hidden. */}
          <div className={`${styles.hint} ${panelOpen ? styles.hintHidden : ""}`} aria-hidden={panelOpen}>
            <div className={styles.hintLine}>
              <span className={styles.hintDot} />
              <span className={styles.hintText}>{countWord(destCount)} DESTINATIONS, CHOSEN FOR YOU</span>
            </div>
            <div className={styles.hintLine}>
              <span className={styles.hintSub}>DRAG TO TURN · SELECT A DESTINATION</span>
            </div>
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
            {selectedDest && openItinerary_ && itin && (
              <ItineraryPanel
                key={`${itin.destId}/${itin.index}`}
                dest={selectedDest}
                itinerary={openItinerary_}
                selectedStop={stop}
                consultant={consultant}
                onBack={closeItinerary}
                onSelectStop={selectStop}
              />
            )}
            {selectedDest && !openItinerary_ && (
              <DestinationPanel
                key={selectedDest.id}
                dest={selectedDest}
                consultant={consultantFirst}
                itineraries={routesEnabled ? selectedDest.itineraries ?? [] : []}
                onOpenItinerary={(i) => openItinerary(selectedDest.id, i)}
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
                  Not part of this shortlist, but if {selectedOther.name} appeals, {consultantFirst || "Ocean Independence"} can build it into your
                  2027 with the same care.
                </p>
                <a className={styles.textLink} href={`${config.atlasUrl}?destination=${encodeURIComponent(selectedOther.id)}`} target="_blank" rel="noopener">
                  EXPLORE THIS DESTINATION →
                </a>
                {askHref && consultantFirst && (
                  <div className={styles.panelFoot}>
                    <a className={styles.btnOutline} href={askHref}>
                      ASK {consultantFirst.toUpperCase()} ABOUT IT
                    </a>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className={styles.railSection} id="pa-rail" data-screen-label="Yacht rail">
        <div className={styles.railHead}>
          <div>
            <div className={styles.eyebrow}>{railEyebrow}</div>
            <h2 className={styles.h2}>YOUR SHORTLIST</h2>
          </div>
          {!(railEnds.start && railEnds.end) && (
            <div className={styles.railNav}>
              <button
                type="button"
                className={styles.railNavBtn}
                onClick={() => stepRail(-1)}
                disabled={railEnds.start}
                aria-controls="pa-rail-track"
                aria-label="Previous yachts"
              >
                <SmallChevronIcon dir="left" />
              </button>
              <button
                type="button"
                className={styles.railNavBtn}
                onClick={() => stepRail(1)}
                disabled={railEnds.end}
                aria-controls="pa-rail-track"
                aria-label="Next yachts"
              >
                <SmallChevronIcon dir="right" />
              </button>
            </div>
          )}
        </div>
        <div className={styles.rail} id="pa-rail-track" ref={railRef}>
          {yachts.map((y, i) => {
            const rate = fmtCardRate(y);
            const total = fmtCardTotal(y);
            const dim = Boolean(selectedDest) && !y.destinationIds.includes(selectedDest!.id);
            const ticked = compare.includes(y.id);
            return (
              <div key={y.id} className={styles.cardWrap}>
                {compareEnabled && (
                  <button
                    type="button"
                    className={`${styles.cmpBtn} ${ticked ? styles.cmpBtnOn : ""}`}
                    title={ticked ? "Remove from comparison" : "Add to comparison"}
                    aria-label={`${ticked ? "Remove" : "Add"} ${y.name} ${ticked ? "from" : "to"} comparison`}
                    aria-pressed={ticked}
                    onClick={() => toggleCompare(y.id)}
                  >
                    <CompareToggleIcon selected={ticked} />
                  </button>
                )}
                <div className={`${styles.card} ${dim ? styles.cardDim : ""}`}>
                  <button
                    type="button"
                    className={styles.cardOpen}
                    onClick={() => openDrawer(i)}
                    aria-label={`${y.name} — open details`}
                  >
                    <div className={styles.cardMedia}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {y.leadImageUrl && <img src={y.imageThumbs?.lead ?? y.leadImageUrl} alt={`${y.name} — exterior profile`} loading="lazy" />}
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.cardName}>{y.name}</div>
                      <YachtMeta yacht={y} />
                      {rate && <div className={styles.cardRate}>{rate}</div>}
                      {total && <div className={styles.cardTotal}>{total}</div>}
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
                  {/* Only the yachts whose brochure link the consultant filled in
                      carry the button; the rail stretches every card to the
                      tallest, so a card without one keeps the same height. */}
                  {hasBrochure(y) && (
                    <div className={styles.cardBrochure}>
                      <a
                        className={styles.cardBrochureLink}
                        href={y.brochureUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${y.name}'s brochure`}
                      >
                        VIEW BROCHURE
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {compareEnabled && !compareOpen && compareYachts.length > 0 && (
        <CompareBar yachts={compareYachts} onOpen={() => compareYachts.length >= 2 && setCompareOpen(true)} onClear={() => setCompare([])} />
      )}
      {compareEnabled && compareOpen && <CompareOverlay yachts={compareYachts} onClose={() => setCompareOpen(false)} />}

      {config.seasonNote && (
        <section className={styles.seasonNote} data-screen-label="Season note">
          <div className={styles.seasonInner}>
            <div className={styles.eyebrow}>{config.seasonNote.eyebrow.toUpperCase()}</div>
            <p className={styles.seasonBody}>{config.seasonNote.body}</p>
          </div>
        </section>
      )}

      {costsEnabled && <CostsSection />}
      {itineraryEnabled && <ItinerarySection itineraryLinks={config.sections?.itineraryLinks} />}

      {/* The foot stays dark on both themes: consultant block and disclaimer
          share one dark surface, as on the Yacht Selection page. */}
      <div className={styles.foot} data-theme="dark">
        {consultant && <ConsultantBlock consultant={consultant} />}

        <div className={styles.disclaimer}>{config.footerDisclaimer}</div>
      </div>

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
              signedBy={consultantFirst || undefined}
              vatText={drawerYacht.vatText}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- destination */

function DestinationPanel({
  dest,
  consultant,
  itineraries,
  onOpenItinerary,
  onSeeYachts,
}: {
  dest: DestinationsPageDestination;
  consultant: string;
  itineraries: DestinationsPageItinerary[];
  onOpenItinerary: (index: number) => void;
  onSeeYachts: () => void;
}) {
  const images = dest.images.filter((img) => img.value);
  return (
    <div className={styles.panelInner} data-screen-label={`Panel — ${dest.name}`}>
      {dest.eyebrow.value && <div className={styles.eyebrow}>{dest.eyebrow.value.toUpperCase()}</div>}
      <h3 className={styles.panelHeading}>{dest.name.toUpperCase()}</h3>
      {dest.deckLine.value && <div className={styles.deck}>{dest.deckLine.value}</div>}
      {dest.description.source === "consultant" && consultant && (
        <div className={`${styles.attribution} ${styles.attributionMint}`}>CURATED FOR YOU BY {consultant.toUpperCase()}</div>
      )}
      {dest.description.value && <p className={styles.description}>{dest.description.value}</p>}
      {dest.consultantNote?.value && (
        <p className={styles.note}>
          {dest.consultantNote.value}
          {consultant && ` — ${consultant}`}
        </p>
      )}
      {images.length > 0 && <PeekCarousel images={images.map((img) => img.value)} name={dest.name} />}
      <button type="button" className={styles.textLink} onClick={onSeeYachts}>
        SEE THE YACHTS ↓
      </button>
      {itineraries.length > 0 && (
        <div className={styles.itins}>
          <div className={styles.itinsHead}>{itineraries.length > 1 ? "SAMPLE ITINERARIES" : "SAMPLE ITINERARY"}</div>
          {itineraries.map((it, i) => (
            <button type="button" key={it.id} className={styles.itinCard} onClick={() => onOpenItinerary(i)}>
              <span className={styles.itinCardEyebrow}>{itineraryEyebrow(it)}</span>
              <span className={styles.itinCardTitle}>{it.title.toUpperCase()}</span>
              <span className={styles.itinCardStops}>{it.teaser || stopsLine(it)}</span>
              <span className={styles.itinCardCta}>VIEW ROUTE ON THE MAP →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- itinerary */

/**
 * The itinerary state of the panel: it replaces the destination body in
 * place — back link, "<N> DAYS · <PORT> RETURN", title, the route's own
 * paragraph, the day-by-day list with a photo per stop, and the contact
 * button (WhatsApp with a prefilled message, else EMAIL ME).
 */
function ItineraryPanel({
  dest,
  itinerary,
  selectedStop,
  consultant,
  onBack,
  onSelectStop,
}: {
  dest: DestinationsPageDestination;
  itinerary: DestinationsPageItinerary;
  selectedStop: number | null;
  consultant: Consultant | null;
  onBack: () => void;
  onSelectStop: (i: number) => void;
}) {
  const first = consultant ? firstName(consultant.name) || consultant.name : "";
  const cta = contactCta(
    consultant,
    `Hello ${first || "Ocean Independence"}, I would like to talk about "${itinerary.title}" for summer 2027.`,
    { whatsapp: "ASK ABOUT THIS ROUTE", email: "EMAIL ME ABOUT THIS ROUTE" }
  );
  return (
    <div className={styles.panelInner} data-screen-label={`Panel — ${dest.name} — ${itinerary.title}`}>
      <button type="button" className={styles.itBack} onClick={onBack}>
        <span aria-hidden="true">←</span> BACK TO {dest.name.toUpperCase()}
      </button>
      <div className={styles.itEyebrow}>{itineraryEyebrow(itinerary)}</div>
      <h3 className={styles.itTitle}>{itinerary.title.toUpperCase()}</h3>
      {itinerary.intro.map((para, i) => (
        <p className={styles.itPara} key={i}>
          {para}
        </p>
      ))}
      <div className={styles.dayHead}>DAY TO DAY · SELECT A STOP</div>
      {/* Each row is a day heading as the website wrote it. Its narrative is
          a full paragraph, shown whole when the row is selected — never cut
          to a line. */}
      <div className={styles.days} role="list">
        {itinerary.stops.map((s, i) => {
          const on = selectedStop === i;
          // A day with no located place still shows its heading and narrative;
          // it simply has nothing to fly to.
          const flyable = s.points.length > 0;
          return (
            <div role="listitem" key={`${s.day}-${s.heading}`} className={`${styles.dayRow} ${on ? styles.dayRowOn : ""}`}>
              <button
                type="button"
                className={styles.dayRowBtn}
                onClick={() => onSelectStop(i)}
                aria-pressed={on}
                aria-expanded={on}
                {...(flyable ? {} : { "aria-label": `${s.heading} — not shown on the map` })}
              >
                <span className={styles.dayNum}>{dayLabel(s)}</span>
                <span className={styles.dayBody}>
                  <span className={styles.dayName}>{s.heading.toUpperCase()}</span>
                </span>
                <span className={styles.dayThumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.image && <img src={s.image} alt="" loading="lazy" decoding="async" />}
                </span>
              </button>
              {on && s.text && <p className={styles.dayText}>{s.text}</p>}
            </div>
          );
        })}
      </div>
      <a className={styles.textLink} href={itinerary.url} target="_blank" rel="noopener">
        READ THIS ITINERARY ON THE WEBSITE →
      </a>
      {cta && (
        <a className={`${styles.btnOutline} ${styles.itCta}`} href={cta.href} {...(cta.external ? { target: "_blank", rel: "noopener" } : {})}>
          {cta.label}
        </a>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- carousel */

/**
 * The destination's images as a peek carousel: each slide is 82% of the
 * track, so the next image is visibly cut off and invites a swipe. Native
 * touch swipe with per-slide snapping; on desktop a pointer drag pans the
 * track (snap off during the drag, then eased to the nearest slide), and the
 * arrows step by exactly one slide. The counter is derived from the scroll
 * position, so it is right after a swipe, a drag or an arrow.
 */
function PeekCarousel({ images, name }: { images: string[]; name: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const drag = useRef<{ down: boolean; x: number; left: number; moved: boolean }>({ down: false, x: 0, left: 0, moved: false });
  const single = images.length < 2;

  const step = useCallback(() => {
    const el = trackRef.current;
    const first = el?.firstElementChild as HTMLElement | null;
    return first ? first.offsetWidth + 10 : el?.clientWidth ?? 1;
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setIndex(Math.min(images.length - 1, Math.max(0, Math.round(el.scrollLeft / step()))));
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [images.length, step]);

  useEffect(() => {
    if (single) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      const el = trackRef.current;
      if (!d.down || !el) return;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 4) d.moved = true;
      el.scrollLeft = d.left - dx;
    };
    const up = () => {
      const d = drag.current;
      const el = trackRef.current;
      if (!d.down || !el) return;
      d.down = false;
      el.style.scrollSnapType = "";
      el.style.cursor = "";
      const s = step();
      el.scrollTo({ left: Math.round(el.scrollLeft / s) * s, behavior: "smooth" });
      // The click that ends a drag must not open the lightbox.
      window.setTimeout(() => {
        d.moved = false;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [single, step]);

  const by = (dir: 1 | -1) => trackRef.current?.scrollBy({ left: dir * step(), behavior: "smooth" });

  return (
    <div className={styles.carousel}>
      <div
        className={`${styles.carTrack} ${single ? styles.carTrackSingle : ""}`}
        ref={trackRef}
        onPointerDown={(e) => {
          if (single || e.pointerType === "touch" || !trackRef.current) return;
          drag.current = { down: true, x: e.clientX, left: trackRef.current.scrollLeft, moved: false };
          trackRef.current.style.scrollSnapType = "none";
          trackRef.current.style.cursor = "grabbing";
        }}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {images.map((src, i) => (
          <div className={styles.carSlide} key={`${src}-${i}`}>
            <EnlargeableImage src={src} alt={`${name} — image ${i + 1} of ${images.length}`} />
          </div>
        ))}
      </div>
      {!single && (
        <>
          <button type="button" className={`${styles.carArrow} ${styles.carArrowPrev}`} onClick={() => by(-1)} aria-label="Previous image">
            <svg width="7" height="14" viewBox="0 0 7 14" fill="none" aria-hidden="true">
              <path d="M6 1L1 7L6 13" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button type="button" className={`${styles.carArrow} ${styles.carArrowNext}`} onClick={() => by(1)} aria-label="Next image">
            <svg width="7" height="14" viewBox="0 0 7 14" fill="none" aria-hidden="true">
              <path d="M1 1L6 7L1 13" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <div className={styles.carCount} aria-live="polite">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
