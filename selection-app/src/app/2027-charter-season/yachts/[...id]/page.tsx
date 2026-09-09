import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Yacht } from "@/lib/types";
import { DEFAULT_APA_PCT } from "@/lib/portal-types";
import { fmtFromRate, fmtFromRateShort } from "@/lib/fleet-bands";
import { children, shortIntro } from "@/lib/atlas/data";
import { getAtlasIndex } from "@/server/atlas/content";
import { getFleetFacts } from "@/server/fleet-facts.mjs";
import { selectFleetForDestination, type FleetFactsDoc } from "@/server/fleet-page";
import FleetPage, { type FleetPageYacht } from "@/components/fleet/FleetPage";

/**
 * Public fleet page for one Atlas destination — a live listing rendered on
 * every request from the nightly fleet facts cache (never from live
 * Yachtfolio calls, never frozen: this is deliberately unlike the Tier 3
 * client pages). The yachts are the ones whose Yachtfolio operating areas
 * map to this destination through the same matcher the Tier 2 form uses.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ID_RE = /^[a-z0-9-]+(\/[a-z0-9-]+){0,3}$/;

function destinationFor(idParts: string[]) {
  const id = idParts.join("/");
  if (!ID_RE.test(id)) return null;
  return getAtlasIndex().byId.get(id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string[] }> }): Promise<Metadata> {
  const { id } = await params;
  const dest = destinationFor(id);
  if (!dest) return { title: "Yachts for charter — Ocean Independence", robots: { index: false, follow: false } };
  const index = getAtlasIndex();
  const title = `Yachts for charter in ${dest.name} — Ocean Independence`;
  const description = shortIntro(dest, 1) || dest.summary || dest.metaDescription;
  return {
    title,
    description,
    alternates: { canonical: `/2027-charter-season/yachts/${dest.id}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "Ocean Independence",
      title,
      description,
      url: `/2027-charter-season/yachts/${dest.id}`,
      images: dest.heroImage ?? dest.cardImage ?? dest.ogImage ? [{ url: (dest.heroImage ?? dest.cardImage ?? dest.ogImage) as string }] : undefined,
    },
    other: { "atlas:children": children(dest, index).length.toString() },
  };
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const dest = destinationFor(id);
  if (!dest) notFound();
  const index = getAtlasIndex();
  const facts = (await getFleetFacts()) as FleetFactsDoc;
  const selection = selectFleetForDestination(dest, index, facts);
  if (selection.level === "none") {
    console.warn(`[fleet-page] no yachts map to ${dest.id} (terms: ${selection.candidate.areaTerms.join(", ")}) — empty state rendered`);
  }
  if (facts.fallback) console.warn(`[fleet-page] ${dest.id}: ${facts.fallback}; demo fleet shown`);

  const yachts: FleetPageYacht[] = selection.yachts.map(({ yacht: y, level }) => {
    const yacht: Yacht = {
      id: String(y.id),
      yachtfolioId: y.id,
      name: y.name.toUpperCase(),
      lengthM: y.lengthM ?? undefined,
      yearRefit: y.yearRefit || undefined,
      guests: y.guests ?? undefined,
      crew: y.crew ?? undefined,
      staterooms: y.staterooms?.count ? { count: y.staterooms.count, breakdown: y.staterooms.breakdown ?? "" } : undefined,
      cruisingArea: y.cruisingArea || undefined,
      ...(y.rateMin != null ? { currency: y.currency ?? "EUR", weeklyRate: y.rateMin, weeklyRateIsFrom: true } : {}),
      leadImageUrl: y.leadImageUrl || "",
      interiorImageUrl: y.interiorImageUrl || y.leadImageUrl || "",
      exteriorImageUrl: y.exteriorImageUrl || y.leadImageUrl || "",
      lifestyleImageUrl: y.lifestyleImageUrl || y.leadImageUrl || "",
      brochureUrl: "#",
    };
    return {
      yacht,
      rateLine: fmtFromRate(y.currency, y.rateMin, DEFAULT_APA_PCT),
      rateLineShort: fmtFromRateShort(y.currency, y.rateMin, DEFAULT_APA_PCT),
      matchLevel: level,
    };
  });

  const sp = await searchParams;
  const consultantRaw = sp.consultant;
  const consultant = (Array.isArray(consultantRaw) ? consultantRaw[0] : consultantRaw)?.slice(0, 80) ?? null;

  return (
    <FleetPage
      destination={{
        id: dest.id,
        name: dest.name || dest.slug,
        lede: shortIntro(dest, 1) || dest.summary || dest.metaDescription,
        heroImage: dest.heroImage ?? dest.cardImage ?? dest.ogImage,
      }}
      yachts={yachts}
      apaPct={DEFAULT_APA_PCT}
      consultant={consultant}
      source={facts.source}
      updatedAt={facts.updatedAt}
    />
  );
}
