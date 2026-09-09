import { NextRequest, NextResponse } from "next/server";
import { canViewAll, createSelection, listSelections } from "@/server/pages.mjs";
import { seedDemoSelection } from "@/server/demo/harrington";
import { requirePortalSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** Dashboard rows for the signed-in consultant (?scope=all for managers). */
export async function GET(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "mine";
  try {
    // Demo mode (no Yachtfolio passkey) and nothing here yet: seed the
    // Harrington Personalised Atlas so the Tier 2 form has content to review.
    let items = await listSelections(session.identity, { scope });
    if (items.length === 0 && (await seedDemoSelection(session.identity))) {
      items = await listSelections(session.identity, { scope });
    }
    return NextResponse.json({ items, scope, canViewAll: canViewAll(session.identity), me: session.identity.id });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Create a new selection (body.tier 2 for a Personalised Atlas, else a Yacht
 * Selection), or duplicate one of the consultant's own (keeps its tier).
 */
export async function POST(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("selection-create", clientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const duplicateOf = typeof body?.duplicateOf === "string" ? body.duplicateOf : undefined;
  const tier = Number(body?.tier) === 2 ? 2 : 3;
  try {
    const draft = await createSelection(session.identity, { duplicateOf, tier });
    return NextResponse.json({ id: draft.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
