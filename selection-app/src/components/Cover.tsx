import type { PageConfig } from "@/lib/types";
import { countWord } from "@/lib/format";
import styles from "./Cover.module.css";

export default function Cover({ config }: { config: PageConfig }) {
  const { clientNames, season, region, headline, yachts, consultant } = config;
  return (
    <section className={styles.cover}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.logo} />
        <span className={styles.headerLabel}>
          {season.toUpperCase()} · {region.toUpperCase()}
        </span>
      </header>
      <div className={styles.centre}>
        <div className={styles.eyebrow}>{countWord(yachts.length)} YACHTS, HELD FOR YOUR REVIEW</div>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.subline}>
          Prepared for {clientNames} by {consultant.name} — {season}, {region}
        </p>
      </div>
    </section>
  );
}
