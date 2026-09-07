import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { draftSlugBase, draftToPageConfig } from "@/lib/portal-map";
import type { PortalDraft } from "@/lib/portal-types";
import { getWorkingDraft, publishWorkingDraft } from "@/server/pages.mjs";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** Publish the signed-in consultant's working draft under a per-client slug. */
export async function POST(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("publish", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const draft = (await getWorkingDraft(session.identity)) as PortalDraft | null;
  if (!draft) {
    return NextResponse.json({ error: "Nothing to publish yet." }, { status: 404 });
  }
  if (!draft.yachts?.some((y) => (y.name ?? "").trim())) {
    return NextResponse.json(
      { error: "Add at least one named yacht before publishing." },
      { status: 422 }
    );
  }
  try {
    const { slug, version } = await publishWorkingDraft({
      identity: session.identity,
      slugBase: draftSlugBase(draft),
      buildConfig: (slug: string) => draftToPageConfig(draft, slug),
    });
    revalidatePath(`/selection/${slug}`);
    return NextResponse.json({ slug, version, url: `/selection/${slug}` });
  } catch (err) {
    if ((err as { code?: string })?.code === "FORBIDDEN") {
      return NextResponse.json({ error: (err as Error).message }, { status: 403 });
    }
    throw err;
  }
}
