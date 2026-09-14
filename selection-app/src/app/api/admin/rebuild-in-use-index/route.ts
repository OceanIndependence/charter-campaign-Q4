import { NextRequest, NextResponse } from "next/server";
import { rebuildInUseIndex } from "@/server/in-use.mjs";
import { requireCronSecret } from "@/server/cron-auth";
import { blobOps, noteStorageError } from "@/server/storage.mjs";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * One-off rebuild of selections/in-use.json from every stored selection.
 * Costs one list() per thousand selections plus free reads; run it once
 * after deploying the index, or whenever a save is known to have raced.
 */
export async function POST(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const before = blobOps();
  try {
    const result = await rebuildInUseIndex();
    const after = blobOps();
    const blob = { puts: after.puts - before.puts, lists: after.lists - before.lists };
    console.log(`[admin/rebuild-in-use-index] ${result.yachts} yacht(s) in use across ${result.selections} selection(s) (${result.published} published); index ${result.written ? "written" : "unchanged"}; Blob list ${blob.lists}, put ${blob.puts}`);
    return NextResponse.json({ ...result, blob });
  } catch (err) {
    noteStorageError("rebuild in-use index", err);
    return NextResponse.json({ error: "The in-use index could not be rebuilt.", detail: String((err as Error)?.message ?? err) }, { status: 503 });
  }
}
