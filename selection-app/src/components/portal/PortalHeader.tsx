import styles from "./PortalForm.module.css";
import SignOutButton from "./SignOutButton";

/** Sticky portal header, showing the signed-in consultant identity. */
export default function PortalHeader({
  consultant = "CHARTER PORTAL",
  initial = "OI",
  showSignOut = false,
}: {
  consultant?: string;
  initial?: string;
  showSignOut?: boolean;
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
        {showSignOut && <SignOutButton />}
      </div>
    </header>
  );
}
