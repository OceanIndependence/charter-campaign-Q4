import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { draftSlugBase, draftToPageConfig } from "@/lib/portal-map";
import type { PortalDraft } from "@/lib/portal-types";
import { getSelection, publishSelection } from "@/server/pages.mjs";
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
    const draft = (await getSelection(session.identity, id)) as PortalDraft;
    if (!draft.yachts?.some((y) => (y.name ?? "").trim())) {
      return NextResponse.json({ error: "Add at least one named yacht before publishing." }, { status: 422 });
    }
    const { slug, version } = await publishSelection({
      identity: session.identity,
      id,
      slugBase: draftSlugBase(draft),
      buildConfig: (slug: string) => draftToPageConfig(draft, slug),
    });
    revalidatePath(`/selection/${slug}`);
    return NextResponse.json({ slug, version, url: `/selection/${slug}` });
  } catch (err) {
    return errorResponse(err);
  }
}
