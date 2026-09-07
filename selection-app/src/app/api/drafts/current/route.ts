import { NextRequest, NextResponse } from "next/server";
import { getOrCreateWorkingDraft, saveWorkingDraft } from "@/server/pages.mjs";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

const MAX_DRAFT_BYTES = 256 * 1024;

/** The signed-in consultant's working draft (created empty if none). */
export async function GET(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  const draft = await getOrCreateWorkingDraft(session.identity);
  return NextResponse.json({ draft });
}

/** Save the signed-in consultant's working draft. Owner is stamped server-side. */
export async function PUT(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("draft-save", clientIp(request), 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const raw = await request.text();
  if (raw.length > MAX_DRAFT_BYTES) {
    return NextResponse.json({ error: "Draft too large." }, { status: 413 });
  }
  let incoming;
  try {
    incoming = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const stored = await saveWorkingDraft(session.identity, incoming);
  return NextResponse.json({ ok: true, id: stored.id, updatedAt: stored.updatedAt });
}
