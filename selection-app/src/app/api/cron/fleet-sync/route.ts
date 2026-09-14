import { NextRequest, NextResponse } from "next/server";
import { runNightlySync } from "@/server/nightly.mjs";
import { isPortalAuthed } from "@/server/portal-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Nightly fleet sync, 03:00 UTC (vercel.json). Vercel Cron calls this with
 * "Authorization: Bearer $CRON_SECRET"; a signed-in consultant may also
 * trigger it manually.
 *
 * Fetches and diffs the fleet list, refreshes only the yachts in use that
 * changed or are seven days unchecked (at most 40, within 300 Yachtfolio
 * calls), fills picker-facts gaps from the budget left, and writes
 * fleet.json once. A Yachtfolio rate limit curtails the run cleanly
 * (curtailed: true, still 200); a storage failure answers 503 so a failing
 * night is visible. See src/server/nightly.mjs.
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
    const result = await runNightlySync();
    return NextResponse.json(result, { status: result.storageError ? 503 : 200 });
  } catch (err) {
    console.error("[cron/fleet-sync]", err);
    if ((err as { code?: string })?.code === "STORAGE") {
      return NextResponse.json({ error: "Fleet sync failed: storage could not be read; nothing was written.", detail: String((err as Error).message) }, { status: 503 });
    }
    return NextResponse.json({ error: "Fleet sync failed.", detail: String((err as Error)?.message ?? err) }, { status: 502 });
  }
}
