import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal/PortalHeader";
import ConsultantImport from "@/components/portal/ConsultantImport";
import styles from "@/components/portal/PortalForm.module.css";
import { adminListConfigured, authProviderInfo, getPortalPageState } from "@/server/auth";
import { ADMIN_CONSULTANTS_PATH, PROFILE_PATH } from "@/lib/consultant-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Import consultants",
  robots: { index: false, follow: false },
};

/**
 * One button: import data/consultants-seed.csv (via the generated module)
 * into the store this deployment is already using, plus the one-off actions
 * beside it. Guarded by PORTAL_ADMIN_EMAILS, server-side here and on every
 * /api/admin route the page calls — the same guard as
 * /portal/admin/consultants.
 *
 * PORTAL_ACCESS_KEY no longer gates this page: with Microsoft sign-in the
 * tenant is the front door, and where the key IS set the staging gate still
 * stands in front of every portal page inside getPortalPageState(). A
 * signed-in visitor who is not an admin is told why rather than bounced,
 * since an unset PORTAL_ADMIN_EMAILS would otherwise be a dead end with
 * nothing on screen to act on.
 */
export default async function ImportConsultantsPage() {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  const { identity, consultant, isAdmin } = state;
  const showSignOut = !authProviderInfo().singleConsultant;
  return (
    <div className={styles.page}>
      <PortalHeader
        consultant={(consultant.displayName || identity.name).toUpperCase()}
        initial={(consultant.displayName || identity.name || identity.email || "?").slice(0, 1).toUpperCase()}
        photoUrl={consultant.photoStatus === "ok" ? consultant.photoUrl : undefined}
        profileHref={PROFILE_PATH}
        adminHref={isAdmin ? ADMIN_CONSULTANTS_PATH : undefined}
        showSignOut={showSignOut}
        backHref="/portal"
      />
      {isAdmin ? <ConsultantImport /> : <NotAnAdmin email={identity.email} />}
    </div>
  );
}

/** Signed in, but not on the admin list — what to change to open the page. */
function NotAnAdmin({ email }: { email: string }) {
  return (
    <main className={styles.main}>
      <div className={styles.eyebrow}>CHARTER PORTAL — ADMIN</div>
      <h1 className={styles.title}>Import consultants</h1>
      <p className={styles.intro}>
        {adminListConfigured() ? (
          <>
            This page is open to the addresses listed in PORTAL_ADMIN_EMAILS, and {email || "this account"} is not one of them. Add it to that
            variable in Vercel (comma-separated), redeploy, and return here.
          </>
        ) : (
          <>
            PORTAL_ADMIN_EMAILS is not set in this environment, so no one is an admin. Set it in Vercel to {email || "your address"}, redeploy,
            and return here. It is the only thing this page asks for — the access key is no longer used.
          </>
        )}
      </p>
    </main>
  );
}
