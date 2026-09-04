import { notFound } from "next/navigation";
import { getAllSlugs, getPageConfig } from "@/lib/demo-config";
import type { PageConfig } from "@/lib/types";
import SelectionPage from "@/components/SelectionPage";
import { getPublishedPage } from "@/server/pages.mjs";

/**
 * Demo slugs are pre-rendered exactly as before; slugs published from the
 * Charter Portal render on demand from the stored page config (the publish
 * route revalidates the path on each new version).
 */
export const dynamicParams = true;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const demoConfig = await getPageConfig(slug);
  if (demoConfig) return <SelectionPage config={demoConfig} />;

  const published = (await getPublishedPage(slug)) as { config?: PageConfig } | null;
  if (!published?.config || published.config.yachts.length === 0) notFound();
  return <SelectionPage config={published.config} />;
}
