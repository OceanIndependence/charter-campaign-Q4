import type { Yacht } from "@/lib/types";
import { fmtCardRate, fmtLengthShort } from "@/lib/format";
import { GuestsIcon, LengthIcon, StateroomsIcon } from "./icons";
import styles from "./RingCarousel.module.css";

interface Props {
  yacht: Yacht;
  /** The front card on the ring (mint dash); a listing card passes true */
  active: boolean;
  /**
   * Public fleet page: the "from" rate line in place of the frozen Tier 3
   * card rate. Omitted on Tier 3, which renders fmtCardRate().
   */
  rateLine?: string;
}

/**
 * The Tier 3 yacht card, inside its frame: 16:10 lead image with the name
 * scrim, the GUESTS / STATEROOMS / LENGTH stat row, the rate and the
 * cruising area. RingCarousel wraps it in the ring's 3D card; the public
 * fleet page wraps it in a flat glass card. Markup and classes are the
 * ones the ring has always rendered.
 */
export default function YachtCardBody({ yacht, active, rateLine }: Props) {
  const rate = rateLine ?? (yacht.weeklyRate != null ? fmtCardRate(yacht) : undefined);
  return (
    <div className={styles.cardBody}>
      <div className={styles.cardImage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={yacht.leadImageUrl} alt={yacht.name} className={styles.cardImg} />
        <div className={styles.cardScrim}>
          <div className={styles.cardName}>{yacht.name}</div>
        </div>
      </div>
      {/* Light theme only (CSS): the name below the image fade. */}
      <div className={styles.cardNameRow}>
        <div className={styles.cardName}>{yacht.name}</div>
      </div>
      <div className={styles.statRow}>
        {yacht.guests != null && (
          <div className={styles.stat}>
            <GuestsIcon />
            <span className={styles.statValue}>{yacht.guests}</span>
            <span className={styles.statLabel}>GUESTS</span>
          </div>
        )}
        {yacht.staterooms && (
          <div className={styles.stat}>
            <StateroomsIcon />
            <span className={styles.statValue}>{yacht.staterooms.count}</span>
            <span className={styles.statLabel}>STATEROOMS</span>
          </div>
        )}
        {yacht.lengthM != null && (
          <div className={styles.stat}>
            <LengthIcon />
            <span className={styles.statValue}>{fmtLengthShort(yacht)}</span>
            <span className={styles.statLabel}>LENGTH</span>
          </div>
        )}
      </div>
      <div className={styles.priceBlock}>
        {rate && <div className={styles.price}>{rate}</div>}
        {yacht.cruisingArea && <div className={styles.area}>CRUISING AREA · {yacht.cruisingArea}</div>}
      </div>
      <div className={active ? styles.dashActive : styles.dash} />
    </div>
  );
}
