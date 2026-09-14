import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { draftSlugBase, draftToPageConfig, freezeImagesAtPublish } from "@/lib/portal-map";
import { chosenDestinationIds, tier2DraftToConfig, tier2PublishProblems, tier2SlugBase } from "@/lib/atlas-map";
import type { AnySelection, PortalDraft, Tier2Draft } from "@/lib/portal-types";
import { atlasResolutionFor } from "@/server/atlas/content";
import { clientPathFor, getSelection, publishSelection, tierOf } from "@/server/pages.mjs";
import { requireConsultantSession } from "@/server/auth";
import { getConsultantRecord } from "@/server/consultant-session";
import { consultantForRecord } from "@/server/consultant-render";
import { PROFILE_PATH, consultantNeedsPhone } from "@/lib/consultant-types";
import type { Consultant } from "@/lib/types";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/**
 * Publish a selection as a versioned client page under a per-client slug.
 *
 * The assigned consultant (the selection's consultantId, else the session
 * consultant for selections that predate records) must have a phone number
 * while active: the client page carries it, so publishing is blocked with
 * a message naming them and linking to their profile. The block frozen
 * into the config is the record as it stands now — the holding-page
 * fallback; every render of the page resolves the record live.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit("publish", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
  try {
    const session = await requireConsultantSession(request);
    if (!session.ok) return session.response;
    const draft = (await getSelection(session.identity, id)) as AnySelection;
    const tier = tierOf(draft);

    const consultantId = draft.consultantId ?? session.consultant.id;
    const record = consultantId === session.consultant.id ? session.consultant : await getConsultantRecord(consultantId);
    if (!record) {
      return NextResponse.json({ error: "The consultant assigned to this selection no longer has a record. Contact marketing." }, { status: 422 });
    }
    if (consultantNeedsPhone(record)) {
      const self = record.id === session.consultant.id;
      return NextResponse.json(
        {
          error: `${record.displayName || "The assigned consultant"} has no phone number on their profile. It appears in the contact block of the client page, so ${self ? "add yours" : "it must be added"} before publishing.`,
          profileUrl: self ? PROFILE_PATH : null,
        },
        { status: 422 }
      );
    }
    const consultant: Consultant | null = consultantForRecord(record);
    const withConsultant = <T extends { consultant: Consultant | null }>(config: T): T => ({ ...config, consultant });
    // Selections created before records existed get their id stamped now.
    if (!draft.consultantId) draft.consultantId = record.id;
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
      buildConfig = (slug: string) => withConsultant(freezeImagesAtPublish(tier2DraftToConfig(d, slug, atlas)));
    } else {
      const d = draft as PortalDraft;
      if (!d.yachts?.some((y) => (y.name ?? "").trim())) {
        return NextResponse.json({ error: "Add at least one named yacht before publishing." }, { status: 422 });
      }
      slugBase = draftSlugBase(d);
      // Specs are frozen here; images are live — the page resolves them from
      // each yacht's record at render time, keyed by the imageRefs mapped above.
      buildConfig = (slug: string) => withConsultant(freezeImagesAtPublish(draftToPageConfig(d, slug)));
    }
    const { slug, version } = await publishSelection({ identity: session.identity, id, slugBase, buildConfig, consultantId: draft.consultantId });
    const url = clientPathFor(tier, slug);
    revalidatePath(url);
    return NextResponse.json({ slug, version, url });
  } catch (err) {
    return errorResponse(err);
  }
}
