import { NextRequest, NextResponse } from "next/server";
import { describeFleetFailure, getYachtDetail } from "@/server/fleet.mjs";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
// Downloads and crops this yacht's images on first pick — allow time for it.
export const maxDuration = 60;

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
    const detail = await getYachtDetail(yfId);
    return NextResponse.json(detail);
  } catch (err) {
    console.error(`[api/fleet/${yfId}]`, err);
    return NextResponse.json(
      { error: `This yacht's details are unavailable. ${describeFleetFailure(err)}` },
      { status: 502 }
    );
  }
}
