"use client";

import type { AtlasDestination, AtlasYacht } from "@/lib/atlas/types";
import {
  children,
  childrenLabel,
  countWords,
  eyebrowFor,
  fmtYachtMeta,
  fmtYachtRate,
  parentOf,
  placesLine,
  POPULAR_IDS,
  shortIntro,
  sirv,
  sirvSrcSet,
  type AtlasIndex,
} from "@/lib/atlas/data";
import styles from "./Atlas.module.css";

export const ENQUIRE_URL = "https://www.oceanindependence.com/contact-us/#enquiry-form";
const MAX_YACHTS = 8;

function Enquire({ className }: { className?: string }) {
  return (
    <a className={`${styles.btnOutline} ${className ?? ""}`} href={ENQUIRE_URL} target="_blank" rel="noopener">
      ENQUIRE
    </a>
  );
}

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
            <div className={styles.sectionTitle}>THE MEDITERRANEAN</div>
            <div className={styles.sectionSub}>The most requested waters of the summer. Select a country to see its cruising grounds</div>
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

function YachtCard({ y }: { y: AtlasYacht }) {
  const rate = fmtYachtRate(y);
  const body = (
    <>
      <div className={styles.yachtMedia}>
        {y.image && (
          <img
            className={styles.cover}
            src={sirv(y.image, 900)}
            srcSet={sirvSrcSet(y.image, [600, 900, 1200])}
            sizes="(max-width: 760px) 100vw, 480px"
            alt={`${y.name} — exterior profile`}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      <div className={styles.yachtBody}>
        <div className={styles.yachtHead}>
          <div className={styles.yachtName}>{y.name.toUpperCase()}</div>
          {rate && <div className={styles.yachtRate}>{rate}</div>}
        </div>
        <div className={styles.yachtMeta}>{fmtYachtMeta(y)}</div>
        {y.tags.length > 0 && <div className={styles.yachtTag}>{y.tags.join(" · ").toUpperCase()}</div>}
      </div>
    </>
  );
  return y.url ? (
    <a className={`${styles.card} ${styles.cardLink}`} href={y.url} target="_blank" rel="noopener">
      {body}
    </a>
  ) : (
    <div className={styles.card}>{body}</div>
  );
}

interface DestinationProps {
  dest: AtlasDestination;
  index: AtlasIndex;
  onSelect: (id: string) => void;
  onBack: () => void;
}

export function DestinationPanel({ dest, index, onSelect, onBack }: DestinationProps) {
  const parent = parentOf(dest, index);
  const kids = children(dest, index);
  const places = placesLine(dest, index);
  const yachts = dest.yachtIds.map((id) => index.snapshot.yachts[id]).filter((y): y is AtlasYacht => !!y);
  const shownYachts = yachts.slice(0, MAX_YACHTS);
  const hero = dest.heroImage ?? dest.cardImage ?? dest.ogImage;
  const facts = dest.keyFacts.filter((f) => !/popular destinations/i.test(f.label));
  const intro = shortIntro(dest);
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

      {shownYachts.length > 0 && (
        <>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>FEATURED YACHTS</div>
            <div className={styles.sectionSub}>Cruising this area in 2027</div>
          </div>
          <div className={styles.grid28}>
            {shownYachts.map((y) => (
              <YachtCard y={y} key={y.id} />
            ))}
          </div>
          {yachts.length > shownYachts.length && (
            <a className={styles.moreLink} href={`${dest.url}#yachts-in-the-area`} target="_blank" rel="noopener">
              VIEW MORE YACHTS IN {dest.name.toUpperCase()}
            </a>
          )}
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

      <div className={styles.panelFoot}>
        {yachts.length > 0 && (
          <p className={styles.footBody}>
            Please note that this is a small selection of yachts and is intended as inspiration rather than a definitive list. A yacht’s cruising area
            for the coming summer is set by her Owner ahead of the season and may differ from the destinations shown here. Your consultant can confirm
            which yachts will be available in your preferred region and suggest further options matched to your requirements.
          </p>
        )}
        <Enquire />
      </div>
    </div>
  );
}
