import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalForm from "@/components/portal/PortalForm";
import PortalHeader from "@/components/portal/PortalHeader";
import styles from "@/components/portal/PortalForm.module.css";
import { authProviderInfo, getPortalPageState } from "@/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Yacht Selection",
  robots: { index: false, follow: false },
};

/** The consultant form for one selection, reached from the dashboard. */
export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  const { id } = await params;
  const { identity } = state;
  const showSignOut = !authProviderInfo().singleConsultant;
  return (
    <div className={styles.page}>
      <PortalHeader
        consultant={identity.name.toUpperCase()}
        initial={(identity.name || identity.email || "?").slice(0, 1).toUpperCase()}
        showSignOut={showSignOut}
        backHref="/portal"
      />
      <PortalForm selectionId={id} />
    </div>
  );
}
