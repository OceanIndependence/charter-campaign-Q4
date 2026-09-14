import { NextRequest, NextResponse } from "next/server";
import { backfillSirv } from "@/server/backfill.mjs";
import { requireCronSecret } from "@/server/cron-auth";
import { noteStorageError } from "@/server/storage.mjs";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/backfill-sirv?limit=N (CRON_SECRET): prepare on Sirv, with
 * force, up to N (default 10) yachts in use whose images are not there yet.
 * Call it repeatedly until `remaining` is 0. Deletes nothing from Blob.
 */
export async function POST(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  try {
    return NextResponse.json(await backfillSirv({ limit: Number.isInteger(limit) && limit > 0 ? limit : undefined }));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "CONFLICT") return NextResponse.json({ error: String((err as Error).message) }, { status: 409 });
    if (code === "STORAGE") noteStorageError("backfill-sirv", err);
    console.error("[admin/backfill-sirv]", err);
    return NextResponse.json({ error: "The Sirv backfill failed.", detail: String((err as Error)?.message ?? err) }, { status: code === "STORAGE" ? 503 : 502 });
  }
}
