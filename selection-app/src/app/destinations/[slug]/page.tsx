import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { DestinationsPageConfig } from "@/lib/types";
import { isDestinationsPageConfig } from "@/lib/types";
import DestinationsPage from "@/components/destinations/DestinationsPage";
import HoldingPage from "@/components/HoldingPage";
import { getPublishedPage } from "@/server/pages.mjs";
import { resolveLiveImages } from "@/server/live-images.mjs";
import { consultantForPage } from "@/server/consultant-render";
import { noteStorageError } from "@/server/storage.mjs";
import { CAMPAIGN_ATLAS_URL } from "@/lib/portal-map";
import { DEMO_TIER2_SLUG, demoDestinationsConfig, demoPagesEnabled } from "@/server/demo/harrington";

/**
 * Tier 2 client pages — a Personalised Atlas published from the Charter
 * Portal, rendered on demand from the stored (frozen) page config with the
 * yachts' images resolved live from their records and the consultant block
 * from the consultant's current record (specs are frozen at publish;
 * images and the consultant are live). Unknown or unpublished slugs, and Tier 3
 * slugs, are 404s. The Harrington demo page renders when nothing has been
 * published under its slug. A storage failure renders a holding page.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Client pages are private links — never index them.
export const metadata: Metadata = {
  title: "Your 2027 Destinations — Ocean Independence",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let published: { config?: DestinationsPageConfig; consultantId?: string } | null;
  try {
    published = (await getPublishedPage(slug)) as { config?: DestinationsPageConfig; consultantId?: string } | null;
  } catch (err) {
    noteStorageError(`read published page ${slug}`, err);
    return <HoldingPage />;
  }
  let config: DestinationsPageConfig | null = null;
  if (published?.config && isDestinationsPageConfig(published.config)) config = published.config;
  else if (!published && slug === DEMO_TIER2_SLUG && demoPagesEnabled()) config = demoDestinationsConfig();
  if (!config || config.destinations.length === 0 || config.yachts.length === 0) notFound();
  // The atlas link is campaign-wide, not part of the client's page.
  const frozen: DestinationsPageConfig = { ...config, atlasUrl: CAMPAIGN_ATLAS_URL };
  let live: DestinationsPageConfig;
  try {
    const consultant = await consultantForPage(published?.consultantId, frozen.consultant);
    live = { ...((await resolveLiveImages(frozen)) as DestinationsPageConfig), consultant };
  } catch (err) {
    noteStorageError(`resolve live images for ${slug}`, err);
    return <HoldingPage consultant={frozen.consultant} />;
  }
  return <DestinationsPage config={live} />;
}
