import { NextRequest, NextResponse } from "next/server";
import { expectedCookieValue, isPortalAuthed } from "@/server/portal-auth";
import { detachConsultantsFromAll } from "@/server/consultant-fixture.mjs";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off: clear consultantId from every existing selection and its
 * published page (undoing the Eleanor fixture attachment). Consultant records
 * are untouched. Same guard as the seed import — PORTAL_ACCESS_KEY, failing
 * closed when unset.
 *
 * TODO(auth): move behind requireAdminSession() once Microsoft sign-in lands.
 */
function requireAccessKey(request: NextRequest): NextResponse | null {
  if (!expectedCookieValue()) return NextResponse.json({ error: "PORTAL_ACCESS_KEY is not set in this environment, so this action is closed." }, { status: 403 });
  if (!isPortalAuthed(request)) return NextResponse.json({ error: "Staging access required — sign in at /portal/login." }, { status: 401 });
  return null;
}

export async function POST(request: NextRequest) {
  const denied = requireAccessKey(request);
  if (denied) return denied;
  if (!rateLimit("detach-consultants", clientIp(request), 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const result = await detachConsultantsFromAll();
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: `Stopped: ${String((err as Error)?.message ?? err)}. Press again to continue; what was already cleared is skipped.` }, { status: 503 });
  }
}
