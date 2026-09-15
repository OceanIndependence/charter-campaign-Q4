import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal/PortalHeader";
import ConsultantImport from "@/components/portal/ConsultantImport";
import styles from "@/components/portal/PortalForm.module.css";
import { expectedCookieValue, isPortalAuthedServer } from "@/server/portal-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Import consultants",
  robots: { index: false, follow: false },
};

/**
 * One button: import data/consultants-seed.csv (via the generated module)
 * into the store this deployment is already using. Guarded by
 * PORTAL_ACCESS_KEY only, server-side, here and on the API route; the key
 * must exist (an unset key closes the page rather than opening it).
 *
 * TODO(auth): once Microsoft sign-in lands, guard this on isAdmin
 * (PORTAL_ADMIN_EMAILS) like /portal/admin/consultants.
 */
export default async function ImportConsultantsPage() {
  const keyConfigured = Boolean(expectedCookieValue());
  if (keyConfigured && !(await isPortalAuthedServer())) redirect("/portal/login");
  return (
    <div className={styles.page}>
      <PortalHeader consultant="ADMIN" initial="OI" backHref="/portal" />
      {keyConfigured ? (
        <ConsultantImport />
      ) : (
        <main className={styles.main}>
          <div className={styles.eyebrow}>CHARTER PORTAL — ADMIN</div>
          <h1 className={styles.title}>Import consultants</h1>
          <p className={styles.intro}>
            This page is closed because PORTAL_ACCESS_KEY is not set in this environment. Set it in Vercel, redeploy, sign in at /portal/login
            with the key, and return here.
          </p>
        </main>
      )}
    </div>
  );
}
