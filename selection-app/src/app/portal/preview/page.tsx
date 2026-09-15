import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SelectionPage from "@/components/SelectionPage";
import PersonalisedAtlasPage from "@/components/personalised/PersonalisedAtlasPage";
import { draftToPageConfig } from "@/lib/portal-map";
import { chosenDestinationIds, tier2DraftToConfig } from "@/lib/atlas-map";
import type { AnySelection, PortalDraft, Tier2Draft } from "@/lib/portal-types";
import { atlasResolutionFor } from "@/server/atlas/content";
import { getSelection, tierOf } from "@/server/pages.mjs";
import { getPortalPageState, selectionAccess } from "@/server/auth";
import { consultantForPage } from "@/server/consultant-render";

export const dynamic = "force-dynamic";

// Preview is behind the portal session and must never be indexed.
export const metadata: Metadata = {
  title: "Preview — Charter Portal",
  robots: { index: false, follow: false },
};

function Message({ text }: { text: string }) {
  return (
    <main
      style={{
        padding: "96px 24px",
        textAlign: "center",
        fontFamily: "Gotham, Helvetica Neue, Arial, sans-serif",
      }}
    >
      <p style={{ fontSize: 13, letterSpacing: "0.1em", color: "#555759" }}>{text}</p>
    </main>
  );
}

/** Renders one of the signed-in consultant's own drafts with the real client page for its tier. */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");

  const { id } = await searchParams;
  if (!id) return <Message text="Choose a selection to preview from your dashboard." />;

  let draft: AnySelection | null = null;
  try {
    draft = (await getSelection(selectionAccess(state), id)) as AnySelection;
  } catch {
    return <Message text="This selection does not exist or is not yours." />;
  }
  // The consultant block exactly as the published page resolves it, live.
  const consultantId = draft.consultantId;
  if (tierOf(draft) === 2) {
    const d = draft as Tier2Draft;
    const base = tier2DraftToConfig(d, d.publishedSlug ?? (d.slug || "preview"), atlasResolutionFor(chosenDestinationIds(d)));
    const config = { ...base, consultant: await consultantForPage(consultantId, base.consultant) };
    if (config.destinations.length === 0) {
      return <Message text="Choose at least one destination to preview the client page." />;
    }
    if (config.yachts.length === 0) {
      return <Message text="Add at least one named yacht to preview the client page." />;
    }
    return <PersonalisedAtlasPage config={config} />;
  }
  const t3 = draft as PortalDraft;
  const base3 = draftToPageConfig(t3, t3.publishedSlug ?? "preview");
  const config = { ...base3, consultant: await consultantForPage(consultantId, base3.consultant) };
  if (config.yachts.length === 0) {
    return <Message text="Add at least one named yacht to preview the client page." />;
  }
  return <SelectionPage config={config} />;
}
