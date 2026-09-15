import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Dashboard from "@/components/portal/Dashboard";
import PortalHeader from "@/components/portal/PortalHeader";
import styles from "@/components/portal/PortalForm.module.css";
import { authProviderInfo, getPortalPageState } from "@/server/auth";
import { ADMIN_CONSULTANTS_PATH, PROFILE_PATH, consultantNeedsPhone, profileGateEnabled } from "@/lib/consultant-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Your Selections",
  robots: { index: false, follow: false },
};

/** Login → dashboard: the consultant's selections, before any form. */
export default async function PortalPage() {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  const { identity, consultant, isAdmin } = state;
  // A client page carries the consultant's phone number: until it is filled
  // in, the profile is the only place to go — once real sign-in makes the
  // session consultant a real person (CONSULTANT_SCOPING on).
  if (profileGateEnabled() && consultantNeedsPhone(consultant)) redirect(PROFILE_PATH);
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
      />
      <Dashboard />
    </div>
  );
}
