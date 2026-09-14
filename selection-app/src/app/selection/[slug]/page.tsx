import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PageConfig } from "@/lib/types";
import { isAtlasPageConfig } from "@/lib/types";
import SelectionPage from "@/components/SelectionPage";
import HoldingPage from "@/components/HoldingPage";
import { getPublishedPage } from "@/server/pages.mjs";
import { resolveLiveImages } from "@/server/live-images.mjs";
import { noteStorageError } from "@/server/storage.mjs";
import { CAMPAIGN_ATLAS_URL } from "@/lib/portal-map";

/**
 * Client pages published from the Charter Portal render on demand from the
 * stored page config (the publish route revalidates the path on each new
 * version); unpublished or unknown slugs are 404s.
 *
 * Specs are frozen at publish; images are live: the specifications, rate
 * and notes are the snapshot's, the photographs are resolved from each
 * yacht's current record at render time. If the snapshot or a record cannot
 * be read, a calm holding page with the consultant's contact details is
 * rendered instead of a 500.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Client selection pages are private links — never index them.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let published: { config?: PageConfig } | null;
  try {
    published = (await getPublishedPage(slug)) as { config?: PageConfig } | null;
  } catch (err) {
    noteStorageError(`read published page ${slug}`, err);
    return <HoldingPage />;
  }
  // Tier 2 pages live at /atlas/<slug>.
  if (!published?.config || isAtlasPageConfig(published.config) || published.config.yachts.length === 0) notFound();
  // Pages published before the slots were renamed (deck → exterior,
  // watertoys → lifestyle) froze the old keys; carry them across.
  type LegacyYacht = PageConfig["yachts"][number] & { deckImageUrl?: string; watertoysImageUrl?: string };
  const frozen: PageConfig = {
    ...published.config,
    // The atlas link is campaign-wide, not part of the client's selection, so
    // pages published before it changed follow the current target.
    atlasUrl: CAMPAIGN_ATLAS_URL,
    yachts: (published.config.yachts as LegacyYacht[]).map((y) => ({
      ...y,
      exteriorImageUrl: y.exteriorImageUrl ?? y.deckImageUrl ?? "",
      lifestyleImageUrl: y.lifestyleImageUrl ?? y.watertoysImageUrl ?? "",
    })),
  };
  let config: PageConfig;
  try {
    config = (await resolveLiveImages(frozen)) as PageConfig;
  } catch (err) {
    noteStorageError(`resolve live images for ${slug}`, err);
    return <HoldingPage consultant={frozen.consultant} atlasUrl={frozen.atlasUrl} />;
  }
  return <SelectionPage config={config} />;
}
