import { NextRequest, NextResponse } from "next/server";
import { describeFleetFailure, getFleet } from "@/server/fleet.mjs";
import { requirePortalAuth } from "@/server/portal-auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = requirePortalAuth(request);
  if (denied) return denied;
  if (!rateLimit("fleet-list", clientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const fleet = await getFleet();
    return NextResponse.json(fleet, {
      headers: { "cache-control": "private, max-age=300" },
    });
  } catch (err) {
    console.error("[api/fleet]", err);
    return NextResponse.json(
      { error: `The fleet list is unavailable. ${describeFleetFailure(err)}` },
      { status: 502 }
    );
  }
}
