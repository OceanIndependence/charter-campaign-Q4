import { NextRequest, NextResponse } from "next/server";
import { expectedCookieValue, isPortalAuthed } from "@/server/portal-auth";
import { attachFixtureConsultant } from "@/server/consultant-fixture.mjs";
import { CONSULTANT_SEED_ROWS } from "@/data/consultants-seed";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off backfill: attach every existing (test) selection to the Eleanor
 * Bartoli Turner fixture record, creating that record from her seed row if
 * needed. Same guard as the seed import — PORTAL_ACCESS_KEY, failing closed
 * when unset.
 *
 * TODO(auth): move behind requireAdminSession() once Microsoft sign-in lands.
 */
function requireAccessKey(request: NextRequest): NextResponse | null {
  if (!expectedCookieValue()) return NextResponse.json({ error: "PORTAL_ACCESS_KEY is not set in this environment, so the backfill is closed." }, { status: 403 });
  if (!isPortalAuthed(request)) return NextResponse.json({ error: "Staging access required — sign in at /portal/login." }, { status: 401 });
  return null;
}

export async function POST(request: NextRequest) {
  const denied = requireAccessKey(request);
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
