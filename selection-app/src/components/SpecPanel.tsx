import type { Yacht } from "@/lib/types";
import { fmtLength, fmtMoney, fmtStaterooms, fmtWeeklyRate } from "@/lib/format";
import { SmallChevronIcon } from "./icons";
import EnlargeableImage from "./EnlargeableImage";
import styles from "./SpecPanel.module.css";

interface SpecPanelProps {
  yacht: Yacht;
  position: number;
  count: number;
  fading: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Tier 2: the consultant's note is signed "— <first name>" */
  signedBy?: string;
  /** Tier 2: VAT row text when no VAT amount is known (Tier 3 shows "TBC") */
  vatText?: string;
}

export default function SpecPanel({
  yacht,
  position,
  count,
  fading,
  onPrev,
  onNext,
  signedBy,
  vatText,
}: SpecPanelProps) {
  /* Rows with no value are hidden rather than rendered as a null. */
  const specRows = (
    [
      ["LENGTH", fmtLength(yacht)],
      ["YEAR / REFIT", yacht.yearRefit],
      ["GUESTS", yacht.guests != null ? String(yacht.guests) : undefined],
      ["CREW", yacht.crew != null ? String(yacht.crew) : undefined],
      ["STATEROOMS", fmtStaterooms(yacht)],
      ["LOCATION", yacht.cruisingArea],
    ] as Array<[string, string | undefined]>
  ).filter((row): row is [string, string] => Boolean(row[1]));

  // Price components are precomputed and frozen at publish; render as stored.
  const cur = yacht.currency;
  const hasVat = yacht.vatAmount != null && yacht.vatPct != null;
  const fromPrefix = yacht.weeklyRateIsFrom ? "from " : "";

  return (
    <div id="ys-specs" className={styles.panel} style={{ opacity: fading ? 0 : 1 }}>
      <div className={styles.headerRow}>
        <span className={styles.pos}>
          {String(position + 1).padStart(2, "0")} OF {count}
        </span>
        <div className={styles.navBtns}>
          <button type="button" className={styles.navBtn} onClick={onPrev} aria-label="Previous yacht">
            <SmallChevronIcon dir="left" />
          </button>
          <button type="button" className={styles.navBtn} onClick={onNext} aria-label="Next yacht">
            <SmallChevronIcon dir="right" />
          </button>
        </div>
      </div>

      <h2 className={styles.name}>{yacht.name}</h2>
      {yacht.notes && (
        <p className={styles.note}>
          {yacht.notes}
          {signedBy ? ` — ${signedBy}` : ""}
        </p>
      )}


      <div className={styles.thumbs}>
        <div className={styles.thumb}>
          <EnlargeableImage src={yacht.interiorImageUrl} alt={`${yacht.name} — interior`} />
        </div>
        <div className={styles.thumb}>
          <EnlargeableImage src={yacht.exteriorImageUrl} alt={`${yacht.name} — exterior`} />
        </div>
        <div className={styles.thumb}>
          <EnlargeableImage src={yacht.lifestyleImageUrl} alt={`${yacht.name} — lifestyle`} />
        </div>
      </div>

      <div>
        {specRows.map(([label, value]) => (
          <div key={label} className={styles.specRow}>
            <span className={styles.specLabel}>{label}</span>
            <span className={styles.specValue}>{value}</span>
          </div>
        ))}
      </div>

      {yacht.weeklyRate != null && (
        <div className={styles.priceBlock}>
          <div className={styles.priceRow}>
            <span className={styles.specLabel}>WEEKLY RATE</span>
            <span className={styles.rateValue}>{fmtWeeklyRate(yacht)}</span>
          </div>
          <div className={styles.priceRow}>
            <span className={styles.specLabel}>VAT{hasVat ? ` (${yacht.vatPct}%)` : ""}</span>
            <span className={styles.dimValue}>
              {hasVat ? `${fromPrefix}${fmtMoney(cur, yacht.vatAmount as number)}` : vatText ?? "TBC"}
            </span>
          </div>
          {yacht.apaAmount != null && yacht.apaPct != null && (
            <div className={styles.priceRow}>
              <span className={styles.specLabel}>APA ({yacht.apaPct}%)</span>
              <span className={styles.dimValue}>
                {fromPrefix}
                {fmtMoney(cur, yacht.apaAmount)}
              </span>
            </div>
          )}
          {yacht.deliveryFee != null && (
            <div className={styles.priceRow}>
              <span className={styles.specLabel}>DELIVERY FEE</span>
              <span className={styles.dimValue}>{fmtMoney(cur, yacht.deliveryFee)}</span>
            </div>
          )}
          {yacht.totalAmount != null && (
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>TOTAL</span>
              <span className={styles.totalValue}>
                {fromPrefix}
                {fmtMoney(cur, yacht.totalAmount)}
              </span>
            </div>
          )}
        </div>
      )}

      {yacht.keyFeatures && yacht.keyFeatures.length > 0 && (
        <div className={styles.highlights}>
          <div className={styles.highlightsHeading}>HIGHLIGHTS</div>
          <ol className={styles.features}>
            {yacht.keyFeatures.map((f, i) => (
              <li key={i} className={styles.feature}>
                <span className={styles.featureNum}>{String(i + 1).padStart(2, "0")}</span>
                <span className={styles.featureText}>{f}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {yacht.brochureUrl && yacht.brochureUrl !== "#" && (
        <div className={styles.brochure}>
          <a href={yacht.brochureUrl} className={styles.brochureLink} target="_blank" rel="noopener">
            VIEW BROCHURE
          </a>
        </div>
      )}
    </div>
  );
}
