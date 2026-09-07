import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SelectionPage from "@/components/SelectionPage";
import { draftToPageConfig } from "@/lib/portal-map";
import type { PortalDraft } from "@/lib/portal-types";
import { getWorkingDraft } from "@/server/pages.mjs";
import { getPortalPageState } from "@/server/auth";

export const dynamic = "force-dynamic";

// Preview is behind the portal session and must never be indexed.
export const metadata: Metadata = {
  title: "Preview — Yacht Selection",
  robots: { index: false, follow: false },
};

/** Renders the signed-in consultant's own working draft with the real Tier 3 page. */
export default async function PreviewPage() {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");

  const draft = (await getWorkingDraft(state.identity)) as PortalDraft | null;
  const config = draft ? draftToPageConfig(draft, draft.publishedSlug ?? "preview") : null;

  if (!config || config.yachts.length === 0) {
    return (
      <main
        style={{
          padding: "96px 24px",
          textAlign: "center",
          fontFamily: "Gotham, Helvetica Neue, Arial, sans-serif",
        }}
      >
        <p style={{ fontSize: 13, letterSpacing: "0.1em", color: "#555759" }}>
          Add at least one named yacht to preview the client page.
        </p>
      </main>
    );
  }
  return <SelectionPage config={config} />;
}
