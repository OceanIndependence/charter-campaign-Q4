"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AtlasSnapshot } from "@/lib/atlas/types";
import type { GlobePin, GlobeView } from "@/lib/atlas/globe";
import { buildIndex, subPinsFor, topLevelPins, zoomFor, type AtlasIndex } from "@/lib/atlas/data";
import { loadItineraries, routePoints, type ItinerariesData, type Itinerary } from "@/lib/atlas/itineraries";
import AtlasGlobe, { type GlobeHandle } from "./AtlasGlobe";
import { DestinationPanel, ENQUIRE_URL, IntroPanel, type RouteView } from "./AtlasPanel";
import styles from "./Atlas.module.css";

const MOBILE_QUERY = "(max-width: 760px)";

/** The snapshot is a separate chunk so the shell paints before the content arrives. */
async function loadSnapshot(): Promise<AtlasSnapshot> {
  const mod = await import("../../../data/destinations.json");
  return mod.default as unknown as AtlasSnapshot;
}

export default function AtlasPage() {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [itineraries, setItineraries] = useState<ItinerariesData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Route state: an itinerary drawn on the globe for the selected destination */
  const [route, setRoute] = useState<RouteView | null>(null);
  const globeRef = useRef<GlobeHandle>(null);
  const asideRef = useRef<HTMLElement>(null);
  /** Camera before the route state, restored on exit */
  const savedView = useRef<GlobeView | null>(null);

  useEffect(() => {
    let alive = true;
    loadSnapshot().then((snap) => {
      if (alive) setIndex(buildIndex(snap));
    });
    loadItineraries()
      .then((data) => {
        if (alive) setItineraries(data);
      })
      .catch(() => {
        if (alive) setItineraries({ generatedAt: "", destinations: {} });
      });
    return () => {
      alive = false;
    };
  }, []);

  const pins = useMemo<GlobePin[]>(() => (index ? topLevelPins(index) : []), [index]);
  const topIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);
  const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

  const scrollPanel = useCallback(() => {
    const aside = asideRef.current;
    if (!aside) return;
    if (isMobile()) {
      // Globe stacks above the panel on small screens: bring the panel up.
      const top = aside.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      aside.scrollTo({ top: 0 });
    }
  }, []);

  const clearRoute = useCallback(() => {
    if (!route) return;
    globeRef.current?.setRoute(null);
    setRoute(null);
    savedView.current = null;
  }, [route]);

  const select = useCallback(
    (id: string) => {
      if (!index) return;
      const dest = index.byId.get(id);
      if (!dest) return;
      const g = globeRef.current;
      if (route) {
        g?.setRoute(null);
        setRoute(null);
        savedView.current = null;
      }
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
    [index, topIds, scrollPanel, route]
  );

  const goHome = useCallback(() => {
    setSelectedId(null);
    setRoute(null);
    savedView.current = null;
    const g = globeRef.current;
    if (g) {
      g.setRoute(null);
      g.setSubPins([]);
      g.setFocus(null);
      g.reset();
    }
    if (asideRef.current && !isMobile()) asideRef.current.scrollTo({ top: 0 });
  }, []);

  const goBack = useCallback(() => {
    if (!index || !selectedId) return goHome();
    const dest = index.byId.get(selectedId);
    if (dest?.parentId) select(dest.parentId);
    else goHome();
  }, [index, selectedId, select, goHome]);

  /* --------------------------------------------------------------- route */

  const selectItinerary = useCallback(
    (it: Itinerary) => {
      const g = globeRef.current;
      const points = routePoints(it);
      if (g) {
        savedView.current = g.getView();
        g.setRoute(points);
        g.fitPoints(points, 1500);
        g.setRouteActive(1);
      }
      setRoute({ itinerary: it, activeDay: 1 });
      if (isMobile()) {
        // Globe above, the day list below: start from the top so both show.
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        asideRef.current?.scrollTo({ top: 0 });
      }
    },
    []
  );

  const exitRoute = useCallback(() => {
    const g = globeRef.current;
    const view = savedView.current;
    clearRoute();
    if (g && view) g.flyToView(view, 1300);
    else if (g && index && selectedId) {
      const dest = index.byId.get(selectedId);
      if (dest?.lat != null && dest.lon != null) g.flyTo(dest.lat, dest.lon, zoomFor(dest), 1300);
    }
    if (!isMobile()) asideRef.current?.scrollTo({ top: 0 });
  }, [clearRoute, index, selectedId]);

  const setActiveDay = useCallback((day: number | null) => {
    setRoute((prev) => (prev && prev.activeDay !== day ? { ...prev, activeDay: day } : prev));
    globeRef.current?.setRouteActive(day);
  }, []);

  const goToDay = useCallback(
    (day: number) => {
      const g = globeRef.current;
      const d = route?.itinerary.days.find((x) => x.day === day);
      setActiveDay(day);
      if (g && d) {
        const view = g.getView();
        g.flyTo(d.lat, d.lng, view ? view.zoom : 4, 900);
      }
    },
    [route, setActiveDay]
  );

  /** A numbered marker on the globe was tapped: highlight and reveal its day. */
  const onRouteDaySelect = useCallback(
    (day: number) => {
      setActiveDay(day);
      const row = asideRef.current?.querySelector<HTMLElement>(`[data-day="${day}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [setActiveDay]
  );

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
  const selectedItineraries = selected && itineraries ? (itineraries.destinations[selected.id] ?? []) : [];

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
        <div className={`${styles.stage} ${route ? styles.stageRoute : ""}`} id="atlas-left" data-screen-label="Globe">
          <AtlasGlobe ref={globeRef} className={styles.globe} pins={pins} onPinSelect={select} onDeselect={goHome} onRouteDaySelect={onRouteDaySelect} />
          <div className={styles.hint} id="atlas-hint">
            <span className={styles.hintDot} />
            <span className={styles.hintText}>{route ? "SELECT A DAY · SCROLL THE LIST TO FOLLOW THE ROUTE" : "DRAG TO TURN · SCROLL TO ZOOM · SELECT A DESTINATION"}</span>
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
            <DestinationPanel
              dest={selected}
              index={index}
              itineraries={selectedItineraries}
              route={route}
              onSelect={select}
              onBack={goBack}
              onSelectItinerary={selectItinerary}
              onExitRoute={exitRoute}
              onActiveDay={setActiveDay}
              onGoToDay={goToDay}
            />
          ) : (
            <IntroPanel index={index} onSelect={select} />
          )}
        </aside>
      </main>
    </div>
  );
}
