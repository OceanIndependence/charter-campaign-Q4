import { NextRequest, NextResponse, after } from "next/server";
import { describeFleetFailure, getYachtDetail } from "@/server/fleet.mjs";
import { startImages } from "@/server/image-store/prepare.mjs";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * "Refresh from Yachtfolio" (consultant session required): refetch the
 * specifications and picker facts now, then re-prepare every image with
 * force so an in-place change behind an unchanged Yachtfolio image id is
 * picked up. One call per yacht per minute.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ yfId: string }> }) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("fleet-refresh-ip", clientIp(request), 12, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { yfId: raw } = await params;
  const yfId = Number.parseInt(raw, 10);
  if (!Number.isInteger(yfId) || yfId <= 0) {
    return NextResponse.json({ error: "Invalid yacht id." }, { status: 400 });
  }
  if (!rateLimit("fleet-refresh-yacht", String(yfId), 1, 60_000)) {
    return NextResponse.json({ error: "This yacht was refreshed less than a minute ago. Please wait a moment and try again." }, { status: 429 });
  }
  try {
    const detail = await getYachtDetail(yfId, { forceRefresh: true });
    const job = await startImages(yfId, { force: true });
    if (job.claimed) {
      after(async () => {
        try {
          await job.run();
        } catch (err) {
          console.error(`[api/fleet/${yfId}/refresh] image refresh failed`, err);
        }
      });
    }
    return NextResponse.json({ detail, images: { ...job.response, claimed: job.claimed } }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error(`[api/fleet/${yfId}/refresh]`, err);
    const code = (err as { code?: string })?.code;
    if (code === "NOT_FOUND") return NextResponse.json({ error: "No such yacht." }, { status: 404 });
    return NextResponse.json(
      { error: `This yacht could not be refreshed. ${describeFleetFailure(err)}` },
      { status: code === "STORAGE" ? 503 : 502 }
    );
  }
}
