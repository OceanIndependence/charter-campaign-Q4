import { NextRequest, NextResponse, after } from "next/server";
import { factsBudgetMs, syncFleet } from "@/server/fleet.mjs";
import { isPortalAuthed } from "@/server/portal-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Most follow-up runs one trigger may chain (2,400 yachts need about a dozen). */
const MAX_FOLLOW_UPS = 40;

/**
 * Nightly fleet sync. Vercel Cron calls this with
 * "Authorization: Bearer $CRON_SECRET"; a signed-in consultant may also
 * trigger it manually.
 *
 * Besides the fleet list, each run reads builder, length and base port for
 * as many yachts as its time budget allows (FLEET_FACTS_BUDGET_MS, default
 * 85 s). While yachts remain, the run starts a follow-up run of itself with
 * the same credentials once its response is sent, so one trigger works
 * through the whole backlog within Yachtfolio's call limit.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const cronOk = Boolean(secret) && bearer === `Bearer ${secret}`;
  const devOk = !secret && process.env.NODE_ENV !== "production";
  if (!cronOk && !devOk && !isPortalAuthed(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const started = Date.now();
  const url = new URL(request.url);
  const followUp = Number(url.searchParams.get("continue")) || 0;
  try {
    const result = await syncFleet({ factsDeadline: started + factsBudgetMs() });
    if (result.factsRemaining > 0 && followUp < MAX_FOLLOW_UPS) {
      const next = new URL(url);
      next.searchParams.set("continue", String(followUp + 1));
      const headers: Record<string, string> = {};
      for (const name of ["authorization", "cookie"]) {
        const value = request.headers.get(name);
        if (value) headers[name] = value;
      }
      result.notes.push(
        `${result.factsRemaining} yacht(s) still to read — follow-up run ${followUp + 1} of up to ${MAX_FOLLOW_UPS} starts when this response is sent.`
      );
      after(async () => {
        // Only the request needs to be delivered; the follow-up runs on its own.
        try {
          await fetch(next, { headers, signal: AbortSignal.timeout(5000) });
        } catch {
          /* timed out waiting for the follow-up's response — expected */
        }
      });
    }
    console.log(
      `[cron/fleet-sync${followUp ? ` +${followUp}` : ""}] ${result.count} yachts (${result.factsCount} with builder/length, ${result.factsRemaining} still to read), ${result.removedCount} recorded removals; ` +
        `fleet ${result.fleetWritten ? "written" : "unchanged"}, reference ${result.referenceWritten ? "written" : "unchanged"}; ` +
        `manifest ${result.manifest}; Blob advanced operations ${result.blob?.advanced ?? "?"}` +
        (result.dryRun ? " (DRY RUN — nothing written)" : "")
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/fleet-sync]", err);
    return NextResponse.json({ error: "Fleet sync failed." }, { status: 502 });
  }
}
