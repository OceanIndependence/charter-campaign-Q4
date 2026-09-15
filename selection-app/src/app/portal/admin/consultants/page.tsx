import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal/PortalHeader";
import ConsultantAdmin from "@/components/portal/ConsultantAdmin";
import styles from "@/components/portal/PortalForm.module.css";
import { authProviderInfo, getPortalPageState } from "@/server/auth";
import { ADMIN_CONSULTANTS_PATH, PROFILE_PATH } from "@/lib/consultant-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Consultants",
  robots: { index: false, follow: false },
};

/**
 * Consultant admin, for identities listed in PORTAL_ADMIN_EMAILS. The
 * guard is server-side here and on every /api/admin/consultants route; the
 * header link is only a convenience. It checks the env var alone, never the
 * admin's own record status, so marking oneself inactive cannot lock the
 * screen.
 */
export default async function ConsultantAdminPage() {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  if (!state.isAdmin) redirect("/portal");
  const { identity, consultant } = state;
  const showSignOut = !authProviderInfo().singleConsultant;
  return (
    <div className={styles.page}>
      <PortalHeader
        consultant={(consultant.displayName || identity.name).toUpperCase()}
        initial={(consultant.displayName || identity.name || identity.email || "?").slice(0, 1).toUpperCase()}
        photoUrl={consultant.photoStatus === "ok" ? consultant.photoUrl : undefined}
        profileHref={PROFILE_PATH}
        adminHref={ADMIN_CONSULTANTS_PATH}
        showSignOut={showSignOut}
        backHref="/portal"
      />
      <ConsultantAdmin />
    </div>
  );
}
