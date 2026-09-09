import { NextRequest, NextResponse } from "next/server";
import { getDestinationContent } from "@/server/atlas/content";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
// Re-reads the destination page and crops its images on first use.
export const maxDuration = 60;

/**
 * The Atlas defaults for one destination (id is a path such as
 * mediterranean/italy/amalfi-coast): copy re-read from the website where it
 * answers, else the checked-in snapshot; images prepared 16:10.
 * ?live=0 skips the website; ?images=0 skips image preparation.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string[] }> }) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("atlas-destination", clientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
  const destId = id.join("/");
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+){0,3}$/.test(destId)) {
    return NextResponse.json({ error: "Invalid destination id." }, { status: 400 });
  }
  const live = request.nextUrl.searchParams.get("live") !== "0";
  const images = request.nextUrl.searchParams.get("images") !== "0";
  try {
    const content = await getDestinationContent(destId, { live, images });
    if (!content) return NextResponse.json({ error: "No such destination in the 2027 Atlas." }, { status: 404 });
    return NextResponse.json(content);
  } catch (err) {
    console.error(`[api/atlas/destinations/${destId}]`, err);
    return NextResponse.json({ error: "The destination content is unavailable." }, { status: 502 });
  }
}
