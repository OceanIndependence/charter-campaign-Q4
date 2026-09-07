import { NextRequest, NextResponse } from "next/server";
import { deleteSelection, getSelection, saveSelection } from "@/server/pages.mjs";
import { requirePortalSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

const MAX_DRAFT_BYTES = 512 * 1024;
type Params = { params: Promise<{ id: string }> };

/** One of the signed-in consultant's selections, in full. */
export async function GET(request: NextRequest, { params }: Params) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    return NextResponse.json({ draft: await getSelection(session.identity, id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Save a selection. Owner and publish state are stamped server-side. */
export async function PUT(request: NextRequest, { params }: Params) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("draft-save", clientIp(request), 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
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
  try {
    const stored = await saveSelection(session.identity, id, incoming);
    return NextResponse.json({ ok: true, id: stored.id, updatedAt: stored.updatedAt });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Delete a never-published draft. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    await deleteSelection(session.identity, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
