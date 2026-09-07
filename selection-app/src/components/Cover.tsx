import type { PageConfig } from "@/lib/types";
import { countWord } from "@/lib/format";
import styles from "./Cover.module.css";

export default function Cover({ config }: { config: PageConfig }) {
  const { clientNames, season, region, headline, welcome, yachts, consultant } = config;
  const headerLabel = [season, region].filter(Boolean).map((s) => s.toUpperCase()).join(" · ");
  const whenWhere = [season, region].filter(Boolean).join(", ");
  const defaultSubline =
    `Prepared for ${clientNames} by ${consultant.name}` + (whenWhere ? ` — ${whenWhere}` : "");
  const subline = welcome && welcome.trim() ? welcome.trim() : defaultSubline;
  return (
    <section className={styles.cover}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.logo} />
        <span className={styles.headerLabel}>{headerLabel}</span>
      </header>
      <div className={styles.centre}>
        <div className={styles.eyebrow}>
          {countWord(yachts.length)} {yachts.length === 1 ? "YACHT" : "YACHTS"}, HELD FOR YOUR REVIEW
        </div>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.subline}>{subline}</p>
      </div>
    </section>
  );
}
