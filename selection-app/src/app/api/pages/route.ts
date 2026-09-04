import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { draftSlugBase, draftToPageConfig } from "@/lib/portal-map";
import type { PortalDraft } from "@/lib/portal-types";
import { getDraft, publishConfig } from "@/server/pages.mjs";
import { requirePortalAuth } from "@/server/portal-auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** Publish a draft: freeze a versioned PageConfig under a per-client slug. */
export async function POST(request: NextRequest) {
  const denied = requirePortalAuth(request);
  if (denied) return denied;
  if (!rateLimit("publish", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const draftId = typeof body?.draftId === "string" ? body.draftId : "";
  const draft = (await getDraft(draftId)) as PortalDraft | null;
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
  if (!draft.yachts?.some((y) => (y.name ?? "").trim())) {
    return NextResponse.json(
      { error: "Add at least one named yacht before publishing." },
      { status: 422 }
    );
  }
  const { slug, version } = await publishConfig({
    draft,
    slugBase: draftSlugBase(draft),
    buildConfig: (slug: string) => draftToPageConfig(draft, slug),
  });
  // The client page may have been cached (or 404-cached) — refresh it now.
  revalidatePath(`/selection/${slug}`);
  return NextResponse.json({ slug, version, url: `/selection/${slug}` });
}
