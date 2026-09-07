import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalHeader from "@/components/portal/PortalHeader";
import SignInPicker from "@/components/portal/SignInPicker";
import styles from "@/components/portal/PortalForm.module.css";
import { authProvider, getIdentityServer } from "@/server/auth";
import { isPortalAuthedServer } from "@/server/portal-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Charter Portal",
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  // Staging gate first; identity second.
  if (!(await isPortalAuthedServer())) redirect("/portal/login");
  // Providers that sign in automatically (single consultant) have nothing to
  // choose — go straight to the form.
  if (await getIdentityServer()) redirect("/portal");
  const provider = authProvider();
  const identities = provider.selectableIdentities();

  return (
    <div className={styles.page}>
      <PortalHeader consultant="CHARTER PORTAL" initial="OI" />
      <div className={styles.loginWrap}>
        <div className={styles.loginCard}>
          <div>
            <div className={styles.eyebrow}>CHARTER PORTAL</div>
            <h1 className={styles.title} style={{ fontSize: "clamp(22px, 3vw, 28px)" }}>
              Choose Consultant
            </h1>
            {provider.isStub ? (
              <p className={styles.intro}>
                Development sign-in stub — pick a consultant to test ownership. This is disabled in
                production, where Microsoft 365 sign-in is used instead.
              </p>
            ) : (
              <p className={styles.intro}>
                {provider.lockedReason ?? "Sign in with your Ocean Independence Microsoft account."}
              </p>
            )}
          </div>
          {provider.isStub && <SignInPicker identities={identities} />}
        </div>
      </div>
    </div>
  );
}
