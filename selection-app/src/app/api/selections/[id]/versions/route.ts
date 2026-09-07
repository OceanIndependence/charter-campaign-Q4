import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { listVersions, rollbackSelection } from "@/server/pages.mjs";
import { requirePortalSession } from "@/server/auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

/** Version history of a published selection, newest first. */
export async function GET(request: NextRequest, { params }: Params) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    return NextResponse.json({ versions: await listVersions(session.identity, id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Roll the live client page back to an earlier version (appends a new one). */
export async function POST(request: NextRequest, { params }: Params) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = await rollbackSelection(session.identity, id, body?.version);
    revalidatePath(`/selection/${result.slug}`);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
