import type { Yacht } from "@/lib/types";
import { fmtLength, fmtMoney, fmtStaterooms, fmtWeeklyRate } from "@/lib/format";
import styles from "./Compare.module.css";

export function CompareBar({
  yachts,
  onOpen,
  onClear,
}: {
  yachts: Yacht[];
  onOpen: () => void;
  onClear: () => void;
}) {
  const canOpen = yachts.length >= 2;
  return (
    <div className={styles.bar}>
      <span className={styles.barNames}>{yachts.map((y) => y.name).join("  ·  ")}</span>
      <button
        type="button"
        className={canOpen ? styles.barGo : styles.barGoDisabled}
        onClick={onOpen}
        disabled={!canOpen}
      >
        COMPARE
      </button>
      <button type="button" className={styles.barClear} onClick={onClear} aria-label="Clear comparison">
        ×
      </button>
    </div>
  );
}

export function CompareOverlay({ yachts, onClose }: { yachts: Yacht[]; onClose: () => void }) {
  /* A yacht with no value gets an empty cell; a row nobody can fill is hidden. */
  const rows: Array<[string, (y: Yacht) => string | undefined]> = (
    [
      ["LENGTH", fmtLength],
      ["YEAR / REFIT", (y) => y.yearRefit],
      ["GUESTS", (y) => (y.guests != null ? String(y.guests) : undefined)],
      ["CREW", (y) => (y.crew != null ? String(y.crew) : undefined)],
      ["STATEROOMS", fmtStaterooms],
      ["LOCATION", (y) => y.cruisingArea],
      ["WEEKLY RATE", fmtWeeklyRate],
      [
        "VAT",
        (y) =>
          y.vatAmount != null && y.vatPct != null
            ? `${y.weeklyRateIsFrom ? "from " : ""}${fmtMoney(y.currency, y.vatAmount)} (${y.vatPct}%)`
            : undefined,
      ],
      [
        "APA",
        (y) =>
          y.apaAmount != null && y.apaPct != null
            ? `${y.weeklyRateIsFrom ? "from " : ""}${fmtMoney(y.currency, y.apaAmount)} (${y.apaPct}%)`
            : undefined,
      ],
      ["DELIVERY FEE", (y) => (y.deliveryFee != null ? fmtMoney(y.currency, y.deliveryFee) : undefined)],
      [
        "TOTAL",
        (y) =>
          y.totalAmount != null
            ? `${y.weeklyRateIsFrom ? "from " : ""}${fmtMoney(y.currency, y.totalAmount)}`
            : undefined,
      ],
    ] as Array<[string, (y: Yacht) => string | undefined]>
  ).filter(([, value]) => yachts.some((y) => value(y)));

  const k = Math.max(yachts.length, 1);
  const gridCols = `minmax(86px, 130px) repeat(${k}, 1fr)`;
  const minW = 86 + k * 150;

  return (
    <div className={styles.overlay}>
      <div className={styles.overlayHeader}>
        <span className={styles.overlayTitle}>COMPARE</span>
        <button type="button" className={styles.overlayClose} onClick={onClose} aria-label="Close comparison">
          ×
        </button>
      </div>
      <div className={styles.scroller}>
        <div style={{ minWidth: minW }}>
          <div className={styles.grid} style={{ gridTemplateColumns: gridCols }}>
            <div />
            {yachts.map((y) => (
              <div key={y.id} className={styles.head}>
                <span>{y.name}</span>
                {y.leadImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.headThumb} src={y.leadImageUrl} alt="" loading="lazy" />
                )}
              </div>
            ))}
          </div>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.row} style={{ gridTemplateColumns: gridCols }}>
              <div className={styles.rowLabel}>{label}</div>
              {yachts.map((y) => (
                <div key={y.id} className={styles.rowValue}>
                  {value(y) ?? ""}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
