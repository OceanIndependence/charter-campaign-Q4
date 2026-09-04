import type { Yacht } from "@/lib/types";
import { apaEUR, fmtEUR, fmtLength, fmtStaterooms, fmtWeeklyRate, totalEUR } from "@/lib/format";
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
      ["STATEROOMS", fmtStaterooms],
      ["LOCATION", (y) => y.location],
      ["AVAILABILITY", (y) => y.availability],
      ["WEEKLY RATE", fmtWeeklyRate],
      [
        yachts.every((y) => y.apaPct === yachts[0].apaPct) ? `APA (${yachts[0].apaPct}%)` : "APA",
        (y) => {
          const apa = apaEUR(y);
          return apa != null ? fmtEUR(apa) : undefined;
        },
      ],
      [
        "TOTAL",
        (y) => {
          const total = totalEUR(y);
          return total != null ? fmtEUR(total) : undefined;
        },
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
                {y.name}
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
