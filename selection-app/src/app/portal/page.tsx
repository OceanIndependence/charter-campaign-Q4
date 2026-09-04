import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalForm from "@/components/portal/PortalForm";
import PortalHeader from "@/components/portal/PortalHeader";
import styles from "@/components/portal/PortalForm.module.css";
import { isPortalAuthedServer } from "@/server/portal-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charter Portal — Yacht Selection",
};

export default async function PortalPage() {
  if (!(await isPortalAuthedServer())) redirect("/portal/login");
  return (
    <div className={styles.page}>
      <PortalHeader />
      <PortalForm />
    </div>
  );
}
