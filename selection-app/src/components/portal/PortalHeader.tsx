import styles from "./PortalForm.module.css";

/**
 * Sticky portal header. Auth/login is out of scope for this build — the
 * consultant identity is the demo profile until the real session exists.
 */
export default function PortalHeader({
  consultant = "LUCY · LONDON",
  initial = "L",
}: {
  consultant?: string;
  initial?: string;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-black.png" alt="Ocean Independence" className={styles.wordmark} />
        <span className={styles.portalLabel}>CHARTER PORTAL</span>
      </div>
      <div className={styles.headerRight}>
        <span className={styles.consultantTag}>{consultant}</span>
        <span className={styles.avatar}>{initial}</span>
      </div>
    </header>
  );
}
