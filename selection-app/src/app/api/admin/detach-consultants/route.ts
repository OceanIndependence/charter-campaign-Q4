import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/auth";
import { detachConsultantsFromAll } from "@/server/consultant-fixture.mjs";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off: clear consultantId from every existing selection and its
 * published page (undoing the Eleanor fixture attachment). Consultant records
 * are untouched. Admin-only (PORTAL_ADMIN_EMAILS).
 */
async function requireAccessKey(request: NextRequest): Promise<NextResponse | null> {
  const session = await requireAdminSession(request);
  return session.ok ? null : session.response;
}

export async function POST(request: NextRequest) {
  const denied = await requireAccessKey(request);
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
