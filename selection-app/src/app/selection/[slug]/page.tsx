import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PageConfig } from "@/lib/types";
import SelectionPage from "@/components/SelectionPage";
import { getPublishedPage } from "@/server/pages.mjs";

/**
 * Client pages published from the Charter Portal render on demand from the
 * stored page config (the publish route revalidates the path on each new
 * version); unpublished or unknown slugs are 404s.
 */
export const dynamic = "force-dynamic";

// Client selection pages are private links — never index them.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const published = (await getPublishedPage(slug)) as { config?: PageConfig } | null;
  if (!published?.config || published.config.yachts.length === 0) notFound();
  // Pages published before the slots were renamed (deck → exterior,
  // watertoys → lifestyle) froze the old keys; carry them across.
  type LegacyYacht = PageConfig["yachts"][number] & { deckImageUrl?: string; watertoysImageUrl?: string };
  const config: PageConfig = {
    ...published.config,
    yachts: (published.config.yachts as LegacyYacht[]).map((y) => ({
      ...y,
      exteriorImageUrl: y.exteriorImageUrl ?? y.deckImageUrl ?? "",
      lifestyleImageUrl: y.lifestyleImageUrl ?? y.watertoysImageUrl ?? "",
    })),
  };
  return <SelectionPage config={config} />;
}
