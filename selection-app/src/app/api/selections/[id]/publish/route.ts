import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { draftSlugBase, draftToPageConfig } from "@/lib/portal-map";
import { chosenDestinationIds, tier2DraftToConfig, tier2PublishProblems, tier2SlugBase } from "@/lib/atlas-map";
import type { AnySelection, PortalDraft, Tier2Draft } from "@/lib/portal-types";
import { atlasResolutionFor } from "@/server/atlas/content";
import { clientPathFor, getSelection, publishSelection, tierOf } from "@/server/pages.mjs";
import { requirePortalSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** Publish a selection as a versioned client page under a per-client slug. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("publish", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
  try {
    const draft = (await getSelection(session.identity, id)) as AnySelection;
    const tier = tierOf(draft);
    let slugBase: string;
    let buildConfig: (slug: string) => unknown;
    if (tier === 2) {
      const d = draft as Tier2Draft;
      const problems = tier2PublishProblems(d);
      if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 422 });
      // Snapshot at publish: destination copy and images are the draft's
      // blocks, coordinates and the surrounding pins come from the Atlas
      // now, yacht facts are the auto-filled Yachtfolio values in the draft.
      const atlas = atlasResolutionFor(chosenDestinationIds(d));
      slugBase = tier2SlugBase(d);
      buildConfig = (slug: string) => tier2DraftToConfig(d, slug, atlas);
    } else {
      const d = draft as PortalDraft;
      if (!d.yachts?.some((y) => (y.name ?? "").trim())) {
        return NextResponse.json({ error: "Add at least one named yacht before publishing." }, { status: 422 });
      }
      slugBase = draftSlugBase(d);
      buildConfig = (slug: string) => draftToPageConfig(d, slug);
    }
    const { slug, version } = await publishSelection({ identity: session.identity, id, slugBase, buildConfig });
    const url = clientPathFor(tier, slug);
    revalidatePath(url);
    return NextResponse.json({ slug, version, url });
  } catch (err) {
    return errorResponse(err);
  }
}
