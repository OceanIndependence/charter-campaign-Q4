import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SelectionPage from "@/components/SelectionPage";
import { draftToPageConfig } from "@/lib/portal-map";
import type { PortalDraft } from "@/lib/portal-types";
import { getSelection } from "@/server/pages.mjs";
import { getPortalPageState } from "@/server/auth";

export const dynamic = "force-dynamic";

// Preview is behind the portal session and must never be indexed.
export const metadata: Metadata = {
  title: "Preview — Yacht Selection",
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

/** Renders one of the signed-in consultant's own drafts with the real Tier 3 page. */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const state = await getPortalPageState();
  if ("redirect" in state) redirect(state.redirect === "login" ? "/portal/login" : "/portal/sign-in");

  const { id } = await searchParams;
  if (!id) return <Message text="Choose a selection to preview from your dashboard." />;

  let draft: PortalDraft | null = null;
  try {
    draft = (await getSelection(state.identity, id)) as PortalDraft;
  } catch {
    return <Message text="This selection does not exist or is not yours." />;
  }
  const config = draftToPageConfig(draft, draft.publishedSlug ?? "preview");
  if (config.yachts.length === 0) {
    return <Message text="Add at least one named yacht to preview the client page." />;
  }
  return <SelectionPage config={config} />;
}
