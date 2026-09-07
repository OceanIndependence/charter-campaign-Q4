import styles from "./PortalForm.module.css";
import SignOutButton from "./SignOutButton";

/** Sticky portal header, showing the signed-in consultant identity. */
export default function PortalHeader({
  consultant = "CHARTER PORTAL",
  initial = "OI",
  showSignOut = false,
  backHref,
}: {
  consultant?: string;
  initial?: string;
  showSignOut?: boolean;
  /** When set, a persistent way back (e.g. to the dashboard) */
  backHref?: string;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-black.png" alt="Ocean Independence" className={styles.wordmark} />
        <span className={styles.portalLabel}>CHARTER PORTAL</span>
        {backHref && (
          <a href={backHref} className={styles.backLink}>
            ← DASHBOARD
          </a>
        )}
      </div>
      <div className={styles.headerRight}>
        <span className={styles.consultantTag}>{consultant}</span>
        <span className={styles.avatar}>{initial}</span>
        {showSignOut && <SignOutButton />}
      </div>
    </header>
  );
}
