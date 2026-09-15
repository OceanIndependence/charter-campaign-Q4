import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/auth";
import { assignSelectionToConsultant } from "@/server/consultant-fixture.mjs";
import { CONSULTANT_SEED_ROWS } from "@/data/consultants-seed";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off, by request: assign one named selection to one named consultant
 * (the constants in consultant-fixture.mjs), moving the draft into that
 * consultant's namespace and stamping its published page. Takes no body, so
 * it cannot become a general reassignment route — a selection's consultant
 * is otherwise fixed at creation. Admin-only (PORTAL_ADMIN_EMAILS).
 */
async function requireAccessKey(request: NextRequest): Promise<NextResponse | null> {
  const session = await requireAdminSession(request);
  return session.ok ? null : session.response;
}

export async function POST(request: NextRequest) {
  const denied = await requireAccessKey(request);
  if (denied) return denied;
  if (!rateLimit("assign-selection", clientIp(request), 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const result = await assignSelectionToConsultant(CONSULTANT_SEED_ROWS, { updatedBy: "import:consultants-seed.csv" });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: `The assignment did not run: ${String((err as Error)?.message ?? err)}` }, { status: 503 });
  }
}
