import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal/PortalHeader";
import SignInPicker from "@/components/portal/SignInPicker";
import MicrosoftSignIn from "@/components/portal/MicrosoftSignIn";
import styles from "@/components/portal/PortalForm.module.css";
import { authProvider, getIdentityServer, stagingGateApplies } from "@/server/auth";
import { isPortalAuthedServer } from "@/server/portal-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Retail Charter Portal",
  robots: { index: false, follow: false },
};

/**
 * Sign-in. With Microsoft it is the same screen as the other Ocean
 * Independence tools: the wordmark, the tool name, one CONTINUE WITH
 * MICROSOFT button and a line saying who may enter. The development stub
 * keeps its identity picker behind the staging key.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; detail?: string; next?: string }> }) {
  const provider = authProvider();
  // Staging gate first (stub/solo only); identity second.
  if (stagingGateApplies() && !(await isPortalAuthedServer())) redirect("/portal/login");
  // Already signed in: straight to the dashboard.
  if (await getIdentityServer()) redirect("/portal");
  const { error, detail, next } = await searchParams;

  if (provider.name === "microsoft" || provider.lockedReason) {
    return <MicrosoftSignIn error={error ?? null} detail={detail ?? null} next={next ?? null} lockedReason={provider.lockedReason} />;
  }

  const identities = provider.selectableIdentities();
  return (
    <div className={styles.page}>
      <PortalHeader consultant="RETAIL CHARTER PORTAL" initial="OI" />
      <div className={styles.loginWrap}>
        <div className={styles.loginCard}>
          <div>
            <div className={styles.eyebrow}>RETAIL CHARTER PORTAL</div>
            <h1 className={styles.title} style={{ fontSize: "clamp(22px, 3vw, 28px)" }}>
              Choose Consultant
            </h1>
            <p className={styles.intro}>
              Development sign-in stub — pick a consultant to test ownership. This is disabled in production, where Microsoft 365 sign-in
              is used instead.
            </p>
          </div>
          {provider.isStub && <SignInPicker identities={identities} />}
        </div>
      </div>
    </div>
  );
}
