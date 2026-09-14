import { NextRequest, NextResponse } from "next/server";
import { backfillFacts } from "@/server/backfill.mjs";
import { requireCronSecret } from "@/server/cron-auth";
import { noteStorageError } from "@/server/storage.mjs";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/backfill-facts?limit=N (CRON_SECRET): read builder, length
 * and base port for up to N (default 100) listed yachts that have none yet
 * and write fleet.json once. Each yacht is one Yachtfolio call about a
 * second apart, so keep N within the function's time limit and mind the
 * shared 800-calls-per-five-minutes allowance. Repeat until `remaining` is 0.
 */
export async function POST(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  // ?debug=1 adds the first failing record's response body (passkey
  // redacted) and a field-name check of the agency basic-list rows.
  const debug = request.nextUrl.searchParams.get("debug") === "1";
  try {
    return NextResponse.json(await backfillFacts({ limit: Number.isInteger(limit) && limit > 0 ? limit : undefined, debug }));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "STORAGE") noteStorageError("backfill-facts", err);
    console.error("[admin/backfill-facts]", err);
    return NextResponse.json({ error: "The facts backfill failed.", detail: String((err as Error)?.message ?? err) }, { status: code === "STORAGE" ? 503 : 502 });
  }
}
