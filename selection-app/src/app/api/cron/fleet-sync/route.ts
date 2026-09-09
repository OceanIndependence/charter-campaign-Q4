import { NextRequest, NextResponse } from "next/server";
import { syncFleet } from "@/server/fleet.mjs";
import { syncFleetFacts } from "@/server/fleet-facts.mjs";
import { isPortalAuthed } from "@/server/portal-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    // Second step: the fleet-wide facts the public fleet page renders from
    // (length, rate, currency, operating areas, lead image), stalest yachts
    // first, within a time budget so the run always finishes.
    let facts = null;
    try {
      facts = await syncFleetFacts({ budgetMs: 200_000 });
    } catch (err) {
      console.error("[cron/fleet-sync] facts step failed", err);
      facts = { error: String((err as Error)?.message ?? err) };
    }
    console.log(
      `[cron/fleet-sync] ${result.count} yachts, ${result.removedCount} recorded removals; ` +
        `fleet ${result.fleetWritten ? "written" : "unchanged"}, reference ${result.referenceWritten ? "written" : "unchanged"}; ` +
        `manifest ${result.manifest}; Blob advanced operations ${result.blob?.advanced ?? "?"}` +
        (result.dryRun ? " (DRY RUN — nothing written)" : "")
    );
    return NextResponse.json({ ...result, facts });
  } catch (err) {
    console.error("[cron/fleet-sync]", err);
    return NextResponse.json({ error: "Fleet sync failed." }, { status: 502 });
  }
}
