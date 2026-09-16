import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal/PortalHeader";
import ProfileForm from "@/components/portal/ProfileForm";
import styles from "@/components/portal/PortalForm.module.css";
import { authProviderInfo, getPortalPageState } from "@/server/auth";
import { ADMIN_CONSULTANTS_PATH, adminNavLabel, PROFILE_PATH, consultantNeedsPhone, profileGateEnabled } from "@/lib/consultant-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Your Profile",
  robots: { index: false, follow: false },
};

/**
 * The consultant's own profile: name, job title, email and photo read-only
 * (owned by marketing through the admin screen), phone and WhatsApp
 * editable. The dashboard sends a consultant here until a phone number is
 * filled in, since it appears on every client page they publish.
 */
export default async function ProfilePage() {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  const { identity, consultant, isAdmin, role } = state;
  const gated = profileGateEnabled() && consultantNeedsPhone(consultant);
  const showSignOut = !authProviderInfo().singleConsultant;
  return (
    <div className={styles.page}>
      <PortalHeader
        consultant={(consultant.displayName || identity.name).toUpperCase()}
        initial={(consultant.displayName || identity.name || identity.email || "?").slice(0, 1).toUpperCase()}
        photoUrl={consultant.photoStatus === "ok" ? consultant.photoUrl : undefined}
        profileHref={PROFILE_PATH}
        adminHref={isAdmin ? ADMIN_CONSULTANTS_PATH : undefined}
        adminLabel={adminNavLabel(role)}
        showSignOut={showSignOut}
        backHref={gated ? undefined : "/portal"}
      />
      <ProfileForm initial={consultant} gated={gated} />
    </div>
  );
}
