import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalForm from "@/components/portal/PortalForm";
import PortalHeader from "@/components/portal/PortalHeader";
import styles from "@/components/portal/PortalForm.module.css";
import { getPortalPageState } from "@/server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Yacht Selection",
};

export default async function PortalPage() {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");
  const { identity } = state;
  return (
    <div className={styles.page}>
      <PortalHeader
        consultant={`${identity.name.toUpperCase()}`}
        initial={(identity.name || identity.email || "?").slice(0, 1).toUpperCase()}
        showSignOut
      />
      <PortalForm />
    </div>
  );
}
