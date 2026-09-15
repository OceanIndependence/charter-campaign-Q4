import { NextRequest, NextResponse } from "next/server";
import { canViewAll, createSelection, listSelections, scopingEnabled } from "@/server/pages.mjs";
import { seedDemoSelection } from "@/server/demo/harrington";
import { requireConsultantSession, selectionAccess } from "@/server/auth";
import { listConsultants, readConsultantRecord } from "@/server/consultants.mjs";
import type { ConsultantRecord, ConsultantSummary } from "@/lib/consultant-types";
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
    const access = selectionAccess(session);
    let items = await listSelections(access, { scope });
    if (items.length === 0 && (await seedDemoSelection(access, session.consultant))) {
      items = await listSelections(access, { scope });
    }
    const consultants: Record<string, DashboardConsultant> = {};
    for (const row of (await listConsultants()) as ConsultantSummary[]) {
      if (row.objectId) consultants[row.objectId] = { id: row.id, displayName: row.displayName, source: row.source, status: row.status };
    }
    return NextResponse.json({
      items,
      scope,
      canViewAll: canViewAll(session.identity),
      /** false while CONSULTANT_SCOPING is off: every row is everyone's */
      scoping: scopingEnabled(),
      /** The session consultant's record id — rows with this consultantId are "mine" */
      me: session.consultant.id,
      consultants,
      myConsultant: { id: session.consultant.id, displayName: session.consultant.displayName, source: session.consultant.source, status: session.consultant.status },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Create a new selection (body.tier 2 for a Personalised Atlas, else a Yacht
 * Selection) for the consultant chosen in body.consultantId — an ACTIVE
 * record, fixed for the selection's whole life — or duplicate one of the
 * session consultant's own (keeps its tier and its consultant).
 *
 * TODO(auth): once real sign-in lands, the picker pre-fills with the
 * signed-in consultant; the body still carries the choice, because a
 * consultant may create a selection on a colleague's behalf.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit("selection-create", clientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const duplicateOf = typeof body?.duplicateOf === "string" ? body.duplicateOf : undefined;
  const tier = Number(body?.tier) === 2 ? 2 : 3;
  try {
    const session = await requireConsultantSession(request);
    if (!session.ok) return session.response;
    const access = selectionAccess(session);
    let consultant: ConsultantRecord | null = null;
    if (!duplicateOf) {
      const chosen = typeof body?.consultantId === "string" ? body.consultantId : "";
      consultant = chosen ? ((await readConsultantRecord(chosen)) as ConsultantRecord | null) : null;
      if (!consultant) return NextResponse.json({ error: "Choose the consultant this selection belongs to." }, { status: 400 });
      if (consultant.status !== "active") return NextResponse.json({ error: `${consultant.displayName} is inactive and cannot be assigned a selection.` }, { status: 400 });
    }
    const draft = await createSelection(access, { duplicateOf, tier, consultant: consultant ?? session.consultant });
    return NextResponse.json({ id: draft.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
