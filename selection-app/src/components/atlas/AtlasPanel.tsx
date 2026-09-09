"use client";

import { useEffect, useRef } from "react";
import type { AtlasDestination } from "@/lib/atlas/types";
import { children, childrenLabel, countWords, eyebrowFor, parentOf, placesLine, POPULAR_IDS, shortIntro, sirv, type AtlasIndex } from "@/lib/atlas/data";
import { nightsLabel, type Itinerary } from "@/lib/atlas/itineraries";
import styles from "./Atlas.module.css";

export const ENQUIRE_URL = "https://www.oceanindependence.com/contact-us/#enquiry-form";
/** The public fleet listing for a destination */
export const yachtsHref = (destinationId: string) => `/2027-charter-season/yachts/${destinationId}`;

/* ------------------------------------------------------------------ intro */

export function IntroPanel({ index, onSelect }: { index: AtlasIndex | null; onSelect: (id: string) => void }) {
  return (
    <div className={styles.panelInner} data-screen-label="Panel — Intro">
      <img className={styles.mark} src="/assets/o-mark-white.png" alt="" width={34} height={43} />
      <h1 className={styles.h1}>2027 CHARTER DESTINATIONS</h1>
      <p className={styles.introCopy}>
        Every cruising ground we serve, on one globe. The Mediterranean leads the summer and is drawn brightest; the rest of the world turns quietly
        behind it. Select a destination to see the yachts, waters and weeks that define its 2027 season.
      </p>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendDotMint}`} />
          FEATURED YACHTS IN 2027
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} />
          DESTINATION GUIDE
        </span>
      </div>
      {index && (
        <>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>MOST POPULAR CHARTER DESTINATIONS</div>
            <div className={styles.sectionSub}>The Mediterranean in summer 2027. Select a country to see its cruising grounds</div>
          </div>
          <ul className={styles.regionList}>
            {POPULAR_IDS.map((id) => index.byId.get(id))
              .filter((d): d is AtlasDestination => !!d)
              .map((d) => {
                const n = d.childIds.length;
                return (
                  <li key={d.id}>
                    <button type="button" className={styles.regionRow} onClick={() => onSelect(d.id)}>
                      <span className={styles.regionName}>{d.name}</span>
                      <span className={styles.regionCount}>{n ? `${n} ${childrenLabel(d, n).toUpperCase()}` : "GUIDE"}</span>
                      <span className={styles.arrow} aria-hidden="true">
                        →
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
          <p className={styles.footnote}>Beyond the Mediterranean, turn the globe: every pin is a destination we charter in 2027.</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ destination */

/** Route state shown in place of the itinerary cards */
export interface RouteView {
  itinerary: Itinerary;
  activeDay: number | null;
}

interface DestinationProps {
  dest: AtlasDestination;
  index: AtlasIndex;
  itineraries: Itinerary[];
  route: RouteView | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onSelectItinerary: (it: Itinerary) => void;
  onExitRoute: () => void;
  onActiveDay: (day: number | null) => void;
  onGoToDay: (day: number) => void;
}

export function DestinationPanel(props: DestinationProps) {
  const { dest, index, itineraries, route, onSelect, onBack, onSelectItinerary, onExitRoute, onActiveDay, onGoToDay } = props;
  if (route) {
    return <RoutePanel dest={dest} index={index} route={route} onExit={onExitRoute} onActiveDay={onActiveDay} onGoToDay={onGoToDay} />;
  }
  const parent = parentOf(dest, index);
  const kids = children(dest, index);
  const places = placesLine(dest, index);
  const hero = dest.heroImage ?? dest.cardImage ?? dest.ogImage;
  const facts = dest.keyFacts.filter((f) => !/popular destinations/i.test(f.label));
  const intro = shortIntro(dest);
  // Website itineraries this page links to, kept to ones about this region.
  const websiteItineraries = (dest.itineraryLinks ?? []).filter((l) => {
    const region = l.url.match(/\/itineraries\/([^/]+)\//)?.[1] ?? "";
    return region === dest.regionId || l.title.toLowerCase().includes(dest.name.toLowerCase());
  });
  const kidsLabel = childrenLabel(dest, kids.length);
  const kidsSub =
    dest.level <= 1
      ? `${countWords(kids.length)} ${kidsLabel} across the ${dest.name}`.replace(/^(\w)/, (c) => c.toUpperCase())
      : `${countWords(kids.length)} ${kidsLabel} to choose between`.replace(/^(\w)/, (c) => c.toUpperCase());

  return (
    <div className={`${styles.panelInner} ${styles.panelDest}`} data-screen-label={`Panel — ${dest.name}`} key={dest.id}>
      <button type="button" className={styles.back} onClick={onBack}>
        <span aria-hidden="true">←</span>&nbsp; {parent ? parent.name.toUpperCase() : "ALL DESTINATIONS"}
      </button>
      <div className={styles.eyebrow}>{eyebrowFor(dest, index).toUpperCase()}</div>
      <h2 className={styles.h2}>{dest.name.toUpperCase()}</h2>
      {places ? <div className={styles.places}>{places.toUpperCase()}</div> : <div className={styles.placesSpacer} />}

      {hero && (
        <div className={styles.hero}>
          <img className={styles.cover} src={sirv(hero, 1200)} alt={`${dest.name}`} loading="eager" decoding="async" />
        </div>
      )}

      {intro && (
        <p className={styles.lede}>
          {intro}{" "}
          <a className={styles.guideLink} href={dest.url} target="_blank" rel="noopener">
            Read the full guide
          </a>
        </p>
      )}

      {kids.length > 0 && (
        <>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>{kidsLabel.toUpperCase()}</div>
            <div className={styles.sectionSub}>{kidsSub}</div>
          </div>
          <div className={styles.grid16}>
            {kids.map((k) => {
              const img = k.cardImage ?? k.heroImage;
              const grandkids = children(k, index);
              const line = grandkids.length ? grandkids.map((g) => g.name).join(" · ") : k.summary;
              return (
                <button type="button" className={`${styles.card} ${styles.subCard}`} key={k.id} onClick={() => onSelect(k.id)}>
                  <div className={styles.subMedia}>
                    {img && <img className={styles.cover} src={sirv(img, 900)} alt="" loading="lazy" decoding="async" />}
                  </div>
                  <div className={styles.subBody}>
                    <div>
                      <div className={styles.subName}>
                        {k.name.toUpperCase()}
                        {k.featured && <span className={styles.subMint} aria-label="Featured yachts" />}
                      </div>
                      <div className={styles.subPlaces}>{line}</div>
                    </div>
                    <div className={styles.arrow} aria-hidden="true">
                      →
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {facts.length > 0 && (
        <dl className={styles.facts}>
          {facts.map((f) => (
            <div className={styles.factRow} key={f.label}>
              <dt className={styles.factLabel}>{f.label.toUpperCase()}</dt>
              <dd className={styles.factValue}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {itineraries.length > 0 && (
        <>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>SUGGESTED ITINERARIES</div>
            <div className={styles.sectionSub}>
              {itineraries.length === 1 ? "One route to trace on the globe" : `${countWords(itineraries.length).replace(/^\w/, (c) => c.toUpperCase())} routes to trace on the globe`}
            </div>
          </div>
          <div className={styles.itinGrid}>
            {itineraries.map((it) => (
              <button type="button" className={styles.itinCard} key={it.id} onClick={() => onSelectItinerary(it)}>
                <span className={styles.itinNights}>{nightsLabel(it.nights)}</span>
                <span className={styles.itinTitle}>{it.title}</span>
                <span className={styles.itinStops}>{it.days.map((d) => d.place.split(",")[0]).join(" · ")}</span>
                <span className={styles.itinCta}>
                  VIEW ON THE GLOBE <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {websiteItineraries.length > 0 && (
        <div className={styles.libraryBlock}>
          <div className={styles.libraryLabel}>FROM THE OCEAN INDEPENDENCE ITINERARY LIBRARY</div>
          {websiteItineraries.map((l) => (
            <a className={styles.libraryLink} key={l.url} href={l.url} target="_blank" rel="noopener">
              <span>{l.title.replace(/\b\w/g, (c) => c.toUpperCase())}</span>
              <span className={styles.libraryDays}>{l.days ? `${l.days} DAYS` : "GUIDE"}</span>
            </a>
          ))}
        </div>
      )}

      <a className={styles.yachtsButton} href={yachtsHref(dest.id)}>
        View yachts for charter in {dest.name}
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ route */

interface RoutePanelProps {
  dest: AtlasDestination;
  index: AtlasIndex;
  route: RouteView;
  onExit: () => void;
  onActiveDay: (day: number | null) => void;
  onGoToDay: (day: number) => void;
}

/**
 * The day list shown while a route is drawn. The day nearest the top third of
 * the panel is active as the list scrolls; hovering or tapping a day also
 * activates it and its marker on the globe.
 */
function RoutePanel({ dest, index, route, onExit, onActiveDay, onGoToDay }: RoutePanelProps) {
  const { itinerary, activeDay } = route;
  const listRef = useRef<HTMLOListElement>(null);
  /** Days the scroll-follow chose itself; anything else was an explicit choice */
  const followedDay = useRef<number | null>(null);
  const explicitAt = useRef(0);

  useEffect(() => {
    // An active day the scroll-follow did not set was chosen by the visitor
    // (hover, tap, or a marker on the globe): hold it against scroll noise.
    if (activeDay != null && activeDay !== followedDay.current) explicitAt.current = Date.now();
  }, [activeDay]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // The scrolling ancestor: the aside on desktop, the window on phones.
    const aside = list.closest("aside");
    const scroller: HTMLElement | Window = aside && aside.scrollHeight > aside.clientHeight + 4 ? aside : window;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (Date.now() - explicitAt.current < 1500) return;
      const items = [...list.querySelectorAll<HTMLElement>("[data-day]")];
      if (!items.length) return;
      // Only follow when the list is long enough to scroll through.
      const viewport = scroller === window ? window.innerHeight : (scroller as HTMLElement).clientHeight;
      if (list.scrollHeight < viewport * 0.6) return;
      const viewportTop = scroller === window ? 0 : (scroller as HTMLElement).getBoundingClientRect().top;
      const viewportH = scroller === window ? window.innerHeight : (scroller as HTMLElement).clientHeight;
      const focusY = viewportTop + viewportH * 0.32;
      let best = items[0];
      let bestD = Infinity;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - focusY);
        if (d < bestD) {
          bestD = d;
          best = el;
        }
      }
      const day = Number(best.dataset.day);
      if (Number.isFinite(day)) {
        followedDay.current = day;
        onActiveDay(day);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [itinerary.id, onActiveDay]);

  return (
    <div className={`${styles.panelInner} ${styles.panelDest}`} data-screen-label={`Route — ${itinerary.title}`} key={itinerary.id}>
      <button type="button" className={styles.back} onClick={onExit}>
        <span aria-hidden="true">←</span>&nbsp; BACK TO {dest.name.toUpperCase()}
      </button>
      <div className={styles.eyebrow}>
        {eyebrowFor(dest, index).toUpperCase()} · {nightsLabel(itinerary.nights)}
      </div>
      <h2 className={styles.h2}>{itinerary.title.toUpperCase()}</h2>
      {itinerary.intro && <p className={styles.lede}>{itinerary.intro}</p>}
      <ol className={styles.dayList} ref={listRef}>
        {itinerary.days.map((d) => {
          const active = d.day === activeDay;
          return (
            <li
              key={d.day}
              data-day={d.day}
              className={`${styles.dayRow} ${active ? styles.dayRowActive : ""}`}
              onMouseEnter={() => onActiveDay(d.day)}
              onClick={() => onGoToDay(d.day)}
            >
              <span className={styles.dayNo}>DAY {d.day}</span>
              <span className={styles.dayBody}>
                <span className={styles.dayPlace}>{d.place.toUpperCase()}</span>
                {d.note && <span className={styles.dayNote}>{d.note}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <a className={styles.yachtsButton} href={yachtsHref(dest.id)}>
        View yachts for charter in {dest.name}
      </a>
    </div>
  );
}

