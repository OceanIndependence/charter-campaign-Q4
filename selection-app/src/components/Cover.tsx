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
      {/* The header keeps the dark theme's look on both themes: a black band
          with the white logo (Cover.module.css paints it on the light page). */}
      <header className={styles.header} data-theme="dark">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-white.png" alt="Ocean Independence" className={styles.logo} />
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
