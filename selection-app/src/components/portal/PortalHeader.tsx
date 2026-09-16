import styles from "./PortalForm.module.css";
import SignOutButton from "./SignOutButton";

/** Sticky portal header, showing the signed-in consultant identity. */
export default function PortalHeader({
  consultant = "CHARTER PORTAL",
  initial = "OI",
  photoUrl,
  profileHref,
  adminHref,
  adminLabel = "CONSULTANTS",
  showSignOut = false,
  backHref,
}: {
  consultant?: string;
  initial?: string;
  /** The consultant's resolved team photo; the initial is shown without one */
  photoUrl?: string;
  /** When set, a link to the consultant's own profile page */
  profileHref?: string;
  /** When set (owner and admins only), a link to the consultant admin screen */
  adminHref?: string;
  /** What that link is called — adminNavLabel(role); ADMIN for the owner, CONSULTANTS for an admin */
  adminLabel?: string;
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
        {adminHref && (
          <a href={adminHref} className={styles.headerLink}>
            {adminLabel}
          </a>
        )}
        {profileHref && (
          <a href={profileHref} className={styles.headerLink}>
            PROFILE
          </a>
        )}
        <span className={styles.consultantTag}>{consultant}</span>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className={`${styles.avatar} ${styles.avatarImg}`} />
        ) : (
          <span className={styles.avatar}>{initial}</span>
        )}
        {showSignOut && <SignOutButton />}
      </div>
    </header>
  );
}
