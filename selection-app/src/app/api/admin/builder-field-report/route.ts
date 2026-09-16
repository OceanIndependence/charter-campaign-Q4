import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { inUseYachtIds } from "@/server/in-use.mjs";
import { runBuilderFieldReport } from "@/server/yachtfolio/builder-field-report.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 32 sequential brochure calls at 400 ms apart, plus Yachtfolio's own
// response time, fits comfortably inside two minutes.
export const maxDuration = 120;

/**
 * TEMPORARY — Phase 0 diagnostic for the BUILDER field. Delete this folder
 * and src/server/yachtfolio/builder-field-report.mjs once the output is in
 * builder-field-report.md.
 *
 * GET /api/admin/builder-field-report            every yacht in selections/in-use.json
 * GET /api/admin/builder-field-report?ids=1,2,3  those Yachtfolio ids only
 *
 * Portal-authed like every fleet route. Reads the passkey from the
 * environment, makes one read-only brochure call per yacht, sequentially,
 * writes nothing, logs only counts, and answers text/plain Markdown with
 * the passkey redacted.
 */
export async function GET(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  // One run per minute per address: the passkey's call budget is shared
  // with the overnight CRM sync, so a refresh storm must not reach Yachtfolio.
  if (!rateLimit("builder-field-report", clientIp(request), 1, 60_000)) {
    return new NextResponse("One run per minute — try again shortly.", { status: 429, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const passkey = process.env.YACHTFOLIO_PASSKEY?.trim();
  if (!passkey) {
    return new NextResponse("YACHTFOLIO_PASSKEY is not set on this deployment — the fleet is the demo set, so there is nothing to report.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const idsParam = request.nextUrl.searchParams.get("ids");
  let ids: number[];
  let source: string;
  if (idsParam) {
    ids = [...new Set(idsParam.split(",").map((v) => Number.parseInt(v.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0))];
    source = "the ids query";
  } else {
    try {
      ids = await inUseYachtIds();
      source = "selections/in-use.json";
    } catch (err) {
      console.error("[admin/builder-field-report] in-use index unreadable", err);
      return new NextResponse("The in-use index could not be read. Pass ?ids=… to run against specific yachts.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  }
  if (ids.length > 60) {
    return new NextResponse(`Refusing to read ${ids.length} brochures in one run; pass ?ids=… in batches of 60 or fewer.`, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const markdown = await runBuilderFieldReport({ passkey, ids, source });
  console.log(`[admin/builder-field-report] ${ids.length} yacht(s) inspected from ${source}`);
  return new NextResponse(`# Builder field report — live results\n\n${markdown}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
