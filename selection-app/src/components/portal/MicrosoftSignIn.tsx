import { MICROSOFT_START_PATH, NO_RECORD_ERROR } from "@/server/auth/microsoft";
import styles from "./MicrosoftSignIn.module.css";

/** Plain-language reasons the callback can send the browser back with. */
function messageFor(error: string | null, detail: string | null, lockedReason: string | null): string | null {
  if (lockedReason) return lockedReason;
  switch (error) {
    case null:
      return null;
    case NO_RECORD_ERROR:
      return "This Microsoft account has no consultant profile in the Retail Charter Portal. Contact marketing to be added.";
    case "not-configured":
      return "Microsoft sign-in is not configured for this environment.";
    case "failed":
      return detail ? `Sign-in did not complete: ${detail}` : "Sign-in did not complete. Please try again.";
    default:
      return "Sign-in did not complete. Please try again.";
  }
}

/**
 * The Microsoft sign-in screen. Deliberately identical to the QR business
 * card tool's login page: wordmark, tool name, one outlined button, one line
 * on who may enter. Server component — the button is a plain link into the
 * OAuth flow.
 */
export default function MicrosoftSignIn({ error, detail, next, lockedReason }: { error: string | null; detail: string | null; next: string | null; lockedReason: string | null }) {
  const message = messageFor(error, detail, lockedReason);
  const href = `${MICROSOFT_START_PATH}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo-signin.png" alt="Ocean Independence" className={styles.logo} />
        <div className={styles.tool}>Retail Charter Campaign Q4</div>
        {lockedReason ? (
          <span className={`${styles.button} ${styles.buttonDisabled}`} aria-disabled="true">
            <MicrosoftMark />
            Continue with Microsoft
          </span>
        ) : (
          <a href={href} className={styles.button}>
            <MicrosoftMark />
            Continue with Microsoft
          </a>
        )}
        <div className={styles.status}>
          {message && (
            <p className={styles.error} role="alert">
              {message}
            </p>
          )}
        </div>
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
    <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true" className={styles.mark}>
      <rect x="0" y="0" width="10" height="10" fill="#F25022" />
      <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
      <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
      <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}
