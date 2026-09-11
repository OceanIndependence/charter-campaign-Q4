import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AtlasPageConfig } from "@/lib/types";
import { isAtlasPageConfig } from "@/lib/types";
import PersonalisedAtlasPage from "@/components/personalised/PersonalisedAtlasPage";
import { getPublishedPage } from "@/server/pages.mjs";
import { CAMPAIGN_ATLAS_URL } from "@/lib/portal-map";
import { DEMO_TIER2_SLUG, demoAtlasConfig, demoPagesEnabled } from "@/server/demo/harrington";

/**
 * Tier 2 client pages — a Personalised Atlas published from the Charter
 * Portal, rendered on demand from the stored (frozen) page config. Unknown or
 * unpublished slugs, and Tier 3 slugs, are 404s. The Harrington demo page
 * renders when nothing has been published under its slug.
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
  const published = (await getPublishedPage(slug)) as { config?: AtlasPageConfig } | null;
  let config: AtlasPageConfig | null = null;
  if (published?.config && isAtlasPageConfig(published.config)) config = published.config;
  else if (!published && slug === DEMO_TIER2_SLUG && demoPagesEnabled()) config = demoAtlasConfig();
  if (!config || config.destinations.length === 0 || config.yachts.length === 0) notFound();
  // The atlas link is campaign-wide, not part of the client's page.
  return <PersonalisedAtlasPage config={{ ...config, atlasUrl: CAMPAIGN_ATLAS_URL }} />;
}
