import { notFound } from "next/navigation";
import { getAllSlugs, getPageConfig } from "@/lib/demo-config";
import SelectionPage from "@/components/SelectionPage";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = await getPageConfig(slug);
  if (!config) notFound();
  return <SelectionPage config={config} />;
}
