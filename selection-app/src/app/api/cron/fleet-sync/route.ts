import { NextRequest, NextResponse } from "next/server";
import { syncFleet } from "@/server/fleet.mjs";
import { isPortalAuthed } from "@/server/portal-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Nightly fleet sync. Vercel Cron calls this with
 * "Authorization: Bearer $CRON_SECRET"; a signed-in consultant may also
 * trigger it manually.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const cronOk = Boolean(secret) && bearer === `Bearer ${secret}`;
  const devOk = !secret && process.env.NODE_ENV !== "production";
  if (!cronOk && !devOk && !isPortalAuthed(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  try {
    const result = await syncFleet();
    console.log(`[cron/fleet-sync] ${result.count} yachts, ${result.removedCount} recorded removals`);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/fleet-sync]", err);
    return NextResponse.json({ error: "Fleet sync failed." }, { status: 502 });
  }
}
