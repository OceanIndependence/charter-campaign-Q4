import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { unpublishSelection } from "@/server/pages.mjs";
import { requirePortalSession } from "@/server/auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** Take the client page offline; the record and its versions are kept. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    const { slug } = await unpublishSelection(session.identity, id);
    revalidatePath(`/selection/${slug}`);
    return NextResponse.json({ ok: true, slug });
  } catch (err) {
    return errorResponse(err);
  }
}
