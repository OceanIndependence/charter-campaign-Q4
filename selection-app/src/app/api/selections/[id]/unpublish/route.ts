import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { unpublishSelection } from "@/server/pages.mjs";
import { requireConsultantSession, selectionAccess } from "@/server/auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** Take the client page offline; the record and its versions are kept. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireConsultantSession(request);
    if (!session.ok) return session.response;
    const { slug } = await unpublishSelection(selectionAccess(session), id);
    revalidatePath(`/selection/${slug}`);
    revalidatePath(`/destinations/${slug}`);
    return NextResponse.json({ ok: true, slug });
  } catch (err) {
    return errorResponse(err);
  }
}
