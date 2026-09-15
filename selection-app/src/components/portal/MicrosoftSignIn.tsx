import { MICROSOFT_START_PATH, NO_RECORD_ERROR } from "@/server/auth/microsoft";
import styles from "./MicrosoftSignIn.module.css";

/** Plain-language reasons the callback can send the browser back with. */
function messageFor(error: string | null, detail: string | null, lockedReason: string | null): string | null {
  if (lockedReason) return lockedReason;
  switch (error) {
    case null:
      return null;
    case NO_RECORD_ERROR:
      return "This Microsoft account has no consultant profile in the Charter Portal. Contact marketing to be added.";
    case "not-configured":
      return "Microsoft sign-in is not configured for this environment.";
    case "failed":
      return detail ? `Sign-in did not complete: ${detail}` : "Sign-in did not complete. Please try again.";
    default:
      return "Sign-in did not complete. Please try again.";
  }
}

/**
 * The Microsoft sign-in screen, matching the other Ocean Independence tools:
 * wordmark, tool name, one button, one line on who may enter. Server
 * component — the button is a plain link into the OAuth flow.
 */
export default function MicrosoftSignIn({ error, detail, next, lockedReason }: { error: string | null; detail: string | null; next: string | null; lockedReason: string | null }) {
  const message = messageFor(error, detail, lockedReason);
  const href = `${MICROSOFT_START_PATH}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-black.png" alt="Ocean Independence" className={styles.logo} />
        <div className={styles.tool}>RETAIL CHARTER CAMPAIGN Q4</div>
        {lockedReason ? (
          <span className={`${styles.button} ${styles.buttonDisabled}`} aria-disabled="true">
            <MicrosoftMark />
            CONTINUE WITH MICROSOFT
          </span>
        ) : (
          <a href={href} className={styles.button}>
            <MicrosoftMark />
            CONTINUE WITH MICROSOFT
          </a>
        )}
        {message && (
          <p className={styles.error} role="alert">
            {message}
          </p>
        )}
        <p className={styles.note}>
          Access is limited to Ocean Independence consultants.
          <br />
          Sign in with your company Microsoft account.
        </p>
      </div>
    </main>
  );
}

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={styles.mark}>
      <rect x="0" y="0" width="8.5" height="8.5" fill="#F25022" />
      <rect x="9.5" y="0" width="8.5" height="8.5" fill="#7FBA00" />
      <rect x="0" y="9.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  );
}
