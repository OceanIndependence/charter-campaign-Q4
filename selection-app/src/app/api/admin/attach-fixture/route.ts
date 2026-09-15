import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/auth";
import { attachFixtureConsultant } from "@/server/consultant-fixture.mjs";
import { CONSULTANT_SEED_ROWS } from "@/data/consultants-seed";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off backfill: attach every existing (test) selection to the Eleanor
 * Bartoli Turner fixture record, creating that record from her seed row if
 * needed. Admin-only (PORTAL_ADMIN_EMAILS). Kept as code with no button
 * on the import page since the fixture attachment was undone.
 */
async function requireAccessKey(request: NextRequest): Promise<NextResponse | null> {
  const session = await requireAdminSession(request);
  return session.ok ? null : session.response;
}

export async function POST(request: NextRequest) {
  const denied = await requireAccessKey(request);
  if (denied) return denied;
  if (!rateLimit("attach-fixture", clientIp(request), 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const result = await attachFixtureConsultant(CONSULTANT_SEED_ROWS, { updatedBy: "import:consultants-seed.csv" });
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: `The backfill stopped: ${String((err as Error)?.message ?? err)}. Press again to continue; what was already moved is skipped.` }, { status: 503 });
  }
}
