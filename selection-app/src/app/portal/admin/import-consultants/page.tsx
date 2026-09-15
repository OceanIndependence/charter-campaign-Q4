import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal/PortalHeader";
import ConsultantImport from "@/components/portal/ConsultantImport";
import styles from "@/components/portal/PortalForm.module.css";
import { authProviderInfo, getPortalPageState } from "@/server/auth";
import { ADMIN_CONSULTANTS_PATH, PROFILE_PATH } from "@/lib/consultant-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Import consultants",
  robots: { index: false, follow: false },
};

/**
 * One button: import data/consultants-seed.csv (via the generated module)
 * into the store this deployment is already using.
 *
 * Guarded on PORTAL_ADMIN_EMAILS, server-side, matching
 * /api/admin/import-consultants and /portal/admin/consultants. It used to
 * be guarded on PORTAL_ACCESS_KEY, which was the front door before sign-in
 * existed; under Microsoft that gate is off, so the page closed itself
 * against the very admin its API already admitted.
 */
export default async function ImportConsultantsPage() {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  if (!state.isAdmin) redirect("/portal");
  const { identity, consultant } = state;
  return (
    <div className={styles.page}>
      <PortalHeader
        consultant={(consultant.displayName || identity.name).toUpperCase()}
        initial={(consultant.displayName || identity.name || identity.email || "?").slice(0, 1).toUpperCase()}
        photoUrl={consultant.photoStatus === "ok" ? consultant.photoUrl : undefined}
        profileHref={PROFILE_PATH}
        adminHref={ADMIN_CONSULTANTS_PATH}
        showSignOut={!authProviderInfo().singleConsultant}
        backHref="/portal"
      />
      <ConsultantImport />
    </div>
  );
}
