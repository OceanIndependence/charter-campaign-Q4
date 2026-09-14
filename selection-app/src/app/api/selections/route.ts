import { NextRequest, NextResponse } from "next/server";
import { canViewAll, createSelection, listSelections } from "@/server/pages.mjs";
import { seedDemoSelection } from "@/server/demo/harrington";
import { requireConsultantSession, requirePortalSession } from "@/server/auth";
import { listConsultants } from "@/server/consultants.mjs";
import type { ConsultantSummary } from "@/lib/consultant-types";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** What the dashboard shows about a row's owner: the consultant record behind the identity, if any. */
export interface DashboardConsultant {
  id: string;
  displayName: string;
  source: ConsultantSummary["source"];
  status: ConsultantSummary["status"];
}

/**
 * Dashboard rows for the signed-in consultant (?scope=all for managers),
 * with the consultant record behind each row's owner keyed by owner id, so
 * the dashboard can flag records created at sign-in rather than seeded.
 */
export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "mine";
  try {
    const session = await requireConsultantSession(request);
    if (!session.ok) return session.response;
    // Demo mode (no Yachtfolio passkey) and nothing here yet: seed the
    // Harrington Personalised Atlas so the Tier 2 form has content to review.
    let items = await listSelections(session.identity, { scope });
    if (items.length === 0 && (await seedDemoSelection(session.identity))) {
      items = await listSelections(session.identity, { scope });
    }
    const consultants: Record<string, DashboardConsultant> = {};
    for (const row of (await listConsultants()) as ConsultantSummary[]) {
      if (row.objectId) consultants[row.objectId] = { id: row.id, displayName: row.displayName, source: row.source, status: row.status };
    }
    return NextResponse.json({
      items,
      scope,
      canViewAll: canViewAll(session.identity),
      me: session.identity.id,
      consultants,
      myConsultant: { id: session.consultant.id, displayName: session.consultant.displayName, source: session.consultant.source, status: session.consultant.status },
    });
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
