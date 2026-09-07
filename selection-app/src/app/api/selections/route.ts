import { NextRequest, NextResponse } from "next/server";
import { canViewAll, createSelection, listSelections } from "@/server/pages.mjs";
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
    const items = await listSelections(session.identity, { scope });
    return NextResponse.json({ items, scope, canViewAll: canViewAll(session.identity), me: session.identity.id });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create a new selection, or duplicate one of the consultant's own. */
export async function POST(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("selection-create", clientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const duplicateOf = typeof body?.duplicateOf === "string" ? body.duplicateOf : undefined;
  try {
    const draft = await createSelection(session.identity, { duplicateOf });
    return NextResponse.json({ id: draft.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
