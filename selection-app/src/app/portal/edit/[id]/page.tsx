import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalForm from "@/components/portal/PortalForm";
import Tier2Form from "@/components/portal/Tier2Form";
import PortalHeader from "@/components/portal/PortalHeader";
import styles from "@/components/portal/PortalForm.module.css";
import { authProviderInfo, getPortalPageState } from "@/server/auth";
import { getSelection, tierOf } from "@/server/pages.mjs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Edit Selection",
  robots: { index: false, follow: false },
};

/**
 * The consultant form for one selection, reached from the dashboard. The
 * tier was fixed when the selection was created and decides which form
 * renders: the Tier 2 Personalised Atlas form or the Tier 3 Yacht Selection.
 */
export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  const { id } = await params;
  const { identity } = state;
  const showSignOut = !authProviderInfo().singleConsultant;
  let tier: 2 | 3 = 3;
  try {
    tier = tierOf(await getSelection(identity, id));
  } catch {
    // Unknown or someone else's selection: the form reports it on load.
  }
  return (
    <div className={styles.page}>
      <PortalHeader
        consultant={identity.name.toUpperCase()}
        initial={(identity.name || identity.email || "?").slice(0, 1).toUpperCase()}
        showSignOut={showSignOut}
        backHref="/portal"
      />
      {tier === 2 ? <Tier2Form selectionId={id} /> : <PortalForm selectionId={id} />}
    </div>
  );
}
