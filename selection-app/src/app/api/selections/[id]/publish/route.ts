import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { draftSlugBase, draftToPageConfig, freezeImagesAtPublish } from "@/lib/portal-map";
import { chosenDestinationIds, tier2DraftToConfig, tier2PublishProblems, tier2SlugBase } from "@/lib/destinations-map";
import type { AnySelection, PortalDraft, Tier2Draft } from "@/lib/portal-types";
import { atlasResolutionFor } from "@/server/atlas/content";
import { clientPathFor, getSelection, publishSelection, scopingEnabled, tierOf } from "@/server/pages.mjs";
import { requireConsultantSession, selectionAccess } from "@/server/auth";
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
 * The selection's consultant must have a phone number while active: the
 * client page carries it, so publishing is blocked with a message naming
 * them (and linking to the profile when it is the session consultant's
 * own). The block frozen into the config is the record as it stands now —
 * the holding-page fallback; every render of the page resolves the record
 * live.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit("publish", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
  try {
    const session = await requireConsultantSession(request);
    if (!session.ok) return session.response;
    const access = selectionAccess(session);
    const draft = (await getSelection(access, id)) as AnySelection;
    const tier = tierOf(draft);

    // No consultant on the selection: with CONSULTANT_SCOPING off this is an
    // ordinary pre-records selection and publishes with the block frozen in
    // its draft; with scoping on it cannot be published.
    let record = null;
    if (draft.consultantId) {
      record = draft.consultantId === session.consultant.id ? session.consultant : await getConsultantRecord(draft.consultantId);
      if (!record) {
        return NextResponse.json({ error: "The consultant assigned to this selection no longer has a record. Contact marketing." }, { status: 422 });
      }
    } else if (scopingEnabled()) {
      return NextResponse.json({ error: "This selection has no consultant attached and cannot be published." }, { status: 422 });
    }
    if (record && consultantNeedsPhone(record)) {
      const self = record.id === session.consultant.id;
      return NextResponse.json(
        {
          error: `${record.displayName || "The assigned consultant"} has no phone number on their profile. It appears in the contact block of the client page, so ${self ? "add yours" : "it must be added"} before publishing.`,
          profileUrl: self ? PROFILE_PATH : null,
        },
        { status: 422 }
      );
    }
    // With a record, the block frozen into the config is that record now (the
    // holding-page fallback); without one, the draft's own block stands.
    const withConsultant = <T extends { consultant: Consultant | null }>(config: T): T => (record ? { ...config, consultant: consultantForRecord(record) } : config);
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
    const { slug, version } = await publishSelection({ access, id, slugBase, buildConfig });
    const url = clientPathFor(tier, slug);
    revalidatePath(url);
    return NextResponse.json({ slug, version, url });
  } catch (err) {
    return errorResponse(err);
  }
}
