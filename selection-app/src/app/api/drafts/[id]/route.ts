import { NextRequest, NextResponse } from "next/server";
import { getDraft, isValidDraftId, saveDraft } from "@/server/pages.mjs";
import { requirePortalAuth } from "@/server/portal-auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

const MAX_DRAFT_BYTES = 256 * 1024;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requirePortalAuth(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isValidDraftId(id)) {
    return NextResponse.json({ error: "Invalid draft id." }, { status: 400 });
  }
  const draft = await getDraft(id);
  return NextResponse.json({ draft });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requirePortalAuth(request);
  if (denied) return denied;
  if (!rateLimit("draft-save", clientIp(request), 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
  if (!isValidDraftId(id)) {
    return NextResponse.json({ error: "Invalid draft id." }, { status: 400 });
  }
  const raw = await request.text();
  if (raw.length > MAX_DRAFT_BYTES) {
    return NextResponse.json({ error: "Draft too large." }, { status: 413 });
  }
  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (draft?.id !== id) {
    return NextResponse.json({ error: "Draft id mismatch." }, { status: 400 });
  }
  const stored = await saveDraft(draft);
  return NextResponse.json({ ok: true, updatedAt: stored.updatedAt });
}
