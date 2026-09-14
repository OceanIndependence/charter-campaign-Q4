import { NextRequest, NextResponse } from "next/server";
import { describeFleetFailure } from "@/server/fleet.mjs";
import { readImages } from "@/server/image-store/prepare.mjs";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Read-only: this yacht's image status, counts and URLs from its record.
 * Performs no writes and no Yachtfolio calls, so it is safe to poll while
 * images are being prepared and safe for anything that can reach the API.
 * Preparation is POST ./images/prepare.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ yfId: string }> }) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("fleet-images", clientIp(request), 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { yfId: raw } = await params;
  const yfId = Number.parseInt(raw, 10);
  if (!Number.isInteger(yfId) || yfId <= 0) {
    return NextResponse.json({ error: "Invalid yacht id." }, { status: 400 });
  }
  try {
    return NextResponse.json(await readImages(yfId), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error(`[api/fleet/${yfId}/images]`, err);
    const code = (err as { code?: string })?.code;
    if (code === "NOT_FOUND") return NextResponse.json({ error: "No such yacht." }, { status: 404 });
    return NextResponse.json(
      { error: `This yacht's images are unavailable. ${describeFleetFailure(err)}` },
      { status: code === "STORAGE" ? 503 : 502 }
    );
  }
}
