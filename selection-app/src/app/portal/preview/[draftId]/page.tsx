import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import SelectionPage from "@/components/SelectionPage";
import { draftToPageConfig } from "@/lib/portal-map";
import type { PortalDraft } from "@/lib/portal-types";
import { getDraft } from "@/server/pages.mjs";
import { isPortalAuthedServer } from "@/server/portal-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview — Yacht Selection",
};

/** Renders the consultant's current draft with the real Tier 3 page. */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  if (!(await isPortalAuthedServer())) redirect("/portal/login");
  const { draftId } = await params;
  const draft = (await getDraft(draftId)) as PortalDraft | null;
  if (!draft) notFound();

  const config = draftToPageConfig(draft, draft.publishedSlug ?? "preview");
  if (config.yachts.length === 0) {
    return (
      <main style={{ padding: "96px 24px", textAlign: "center", fontFamily: "Gotham, Helvetica Neue, Arial, sans-serif" }}>
        <p style={{ fontSize: 13, letterSpacing: "0.1em", color: "#555759" }}>
          Add at least one named yacht to preview the client page.
        </p>
      </main>
    );
  }
  return <SelectionPage config={config} />;
}
