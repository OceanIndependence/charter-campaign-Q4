import type { Yacht } from "@/lib/types";
import { apaEUR, fmtEUR, fmtLength, fmtStaterooms, totalEUR } from "@/lib/format";
import { SmallChevronIcon } from "./icons";
import styles from "./SpecPanel.module.css";

interface SpecPanelProps {
  yacht: Yacht;
  position: number;
  count: number;
  fading: boolean;
  consultantName: string;
  onPrev: () => void;
  onNext: () => void;
}

export default function SpecPanel({
  yacht,
  position,
  count,
  fading,
  consultantName,
  onPrev,
  onNext,
}: SpecPanelProps) {
  const specRows: Array<[string, string]> = [
    ["LENGTH", fmtLength(yacht)],
    ["YEAR / REFIT", yacht.yearRefit],
    ["GUESTS", String(yacht.guests)],
    ["STATEROOMS", fmtStaterooms(yacht)],
    ["LOCATION", yacht.location],
    ["AVAILABILITY", yacht.availability],
  ];

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

      <div className={styles.thumbs}>
        {/* eslint-disable @next/next/no-img-element */}
        <div className={styles.thumb}>
          <img src={yacht.interiorImageUrl} alt={`${yacht.name} — interior`} loading="lazy" />
        </div>
        <div className={styles.thumb}>
          <img src={yacht.deckImageUrl} alt={`${yacht.name} — deck spaces`} loading="lazy" />
        </div>
        <div className={styles.thumb}>
          <img src={yacht.watertoysImageUrl} alt={`${yacht.name} — watertoys`} loading="lazy" />
        </div>
        {/* eslint-enable @next/next/no-img-element */}
      </div>

      <div>
        {specRows.map(([label, value]) => (
          <div key={label} className={styles.specRow}>
            <span className={styles.specLabel}>{label}</span>
            <span className={styles.specValue}>{value}</span>
          </div>
        ))}
      </div>

      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          <span className={styles.specLabel}>WEEKLY RATE</span>
          <span className={styles.rateValue}>{fmtEUR(yacht.weeklyRateEUR)}</span>
        </div>
        <div className={styles.priceRow}>
          <span className={styles.specLabel}>VAT</span>
          <span className={styles.dimValue}>TBC</span>
        </div>
        <div className={styles.priceRow}>
          <span className={styles.specLabel}>APA ({yacht.apaPct}%)</span>
          <span className={styles.dimValue}>{fmtEUR(apaEUR(yacht))}</span>
        </div>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>TOTAL</span>
          <span className={styles.totalValue}>{fmtEUR(totalEUR(yacht))}</span>
        </div>
      </div>

      <p className={styles.note}>
        {yacht.notes} — {consultantName}
      </p>

      <div className={styles.brochure}>
        <a href={yacht.brochureUrl} className={styles.brochureLink}>
          VIEW BROCHURE
        </a>
      </div>
    </div>
  );
}
