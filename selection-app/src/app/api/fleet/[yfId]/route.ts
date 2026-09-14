import { NextRequest, NextResponse } from "next/server";
import { describeFleetFailure, getStoredYachtDetail, getYachtDetail } from "@/server/fleet.mjs";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
// Specifications only (brochure + basic record), served from the yacht's
// record while fresh and refetched once when stale; never any image work.
// Images are read from ./images and prepared by POST ./images/prepare.
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ yfId: string }> }
) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("fleet-detail", clientIp(request), 12, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { yfId: raw } = await params;
  const yfId = Number.parseInt(raw, 10);
  if (!Number.isInteger(yfId) || yfId <= 0) {
    return NextResponse.json({ error: "Invalid yacht id." }, { status: 400 });
  }
  try {
    // ?debug=1 forces a fresh fetch and appends passkey-redacted raw-shape
    // diagnostics (top-level keys, yachtfolio links) for locating fields the
    // 2023 documentation does not describe. Session-gated like everything else.
    const debug = request.nextUrl.searchParams.get("debug") === "1";
    const detail = await getYachtDetail(yfId, { debug });
    return NextResponse.json(detail);
  } catch (err) {
    console.error(`[api/fleet/${yfId}]`, err);
    const code = (err as { code?: string })?.code;
    if (code === "NOT_FOUND") return NextResponse.json({ error: "No such yacht." }, { status: 404 });
    if (code !== "STORAGE") {
      // Yachtfolio could not be reached: serve what the record holds, with
      // its date, and say so — never a blocking error for the form.
      try {
        const stored = await getStoredYachtDetail(yfId);
        if (stored) return NextResponse.json({ ...stored, stale: true, yachtfolioError: describeFleetFailure(err) });
      } catch (storageErr) {
        console.error(`[api/fleet/${yfId}] record unreadable`, storageErr);
      }
    }
    return NextResponse.json(
      { error: `This yacht's details are unavailable. ${describeFleetFailure(err)}` },
      { status: code === "STORAGE" ? 503 : 502 }
    );
  }
}
