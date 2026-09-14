import { NextRequest, NextResponse } from "next/server";
import { readdir } from "@/server/image-store/sirv-client.mjs";
import { sirvConfig, sirvConfigured } from "@/server/image-store/index.mjs";
import { requireCronSecret } from "@/server/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/admin/sirv-readdir?path=/yachtfolio_images (CRON_SECRET): list a
 * Sirv folder — the first-deploy check of the campaign folder and of the
 * filename convention the CRM images use. Read-only, diagnostic only; never
 * on a runtime path.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  if (!sirvConfigured()) return NextResponse.json({ error: "Sirv is not configured." }, { status: 409 });
  const path = request.nextUrl.searchParams.get("path") || sirvConfig().rootPath;
  try {
    const contents = await readdir(path);
    return NextResponse.json({ path, count: contents.length, contents });
  } catch (err) {
    return NextResponse.json({ error: "Sirv readdir failed.", detail: String((err as Error)?.message ?? err) }, { status: 502 });
  }
}
