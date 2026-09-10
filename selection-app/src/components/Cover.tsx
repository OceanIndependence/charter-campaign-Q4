import type { PageConfig } from "@/lib/types";
import styles from "./Cover.module.css";

/** Cover eyebrow when the consultant leaves the sub-headline blank. */
const DEFAULT_EYEBROW = "TIME TO START PLANNING AHEAD";

export default function Cover({ config }: { config: PageConfig }) {
  const { clientNames, season, region, headline, subHeadline, welcome, consultant } = config;
  const headerLabel = [season, region].filter(Boolean).map((s) => s.toUpperCase()).join(" · ");
  const whenWhere = [season, region].filter(Boolean).join(", ");
  const defaultSubline =
    `Prepared for ${clientNames} by ${consultant.name}` + (whenWhere ? ` — ${whenWhere}` : "");
  const subline = welcome && welcome.trim() ? welcome.trim() : defaultSubline;
  const eyebrow = subHeadline && subHeadline.trim() ? subHeadline.trim() : DEFAULT_EYEBROW;
  return (
    <section className={styles.cover}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={config.theme === "light" ? "/assets/logo-black.png" : "/assets/logo-white.png"} alt="Ocean Independence" className={styles.logo} />
        <span className={styles.headerLabel}>{headerLabel}</span>
      </header>
      <div className={styles.centre}>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.subline}>{subline}</p>
      </div>
    </section>
  );
}
