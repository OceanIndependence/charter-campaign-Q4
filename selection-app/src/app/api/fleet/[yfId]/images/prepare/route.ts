import { NextRequest, NextResponse, after } from "next/server";
import { describeFleetFailure } from "@/server/fleet.mjs";
import { startImages } from "@/server/image-store/prepare.mjs";
import { requirePortalSession } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
// The response goes out as soon as the job is claimed; the downloads and
// uploads continue in this invocation until they finish or time runs out.
export const maxDuration = 120;

/**
 * Start preparing this yacht's images (consultant session required). Returns
 * the record's images payload at once — status "preparing" when this call
 * claimed the job, or the current state when a job under five minutes old
 * already owns it — and continues the work after the response is sent. The
 * portal polls GET ../images every three seconds meanwhile.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ yfId: string }> }) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  if (!rateLimit("fleet-images-prepare", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { yfId: raw } = await params;
  const yfId = Number.parseInt(raw, 10);
  if (!Number.isInteger(yfId) || yfId <= 0) {
    return NextResponse.json({ error: "Invalid yacht id." }, { status: 400 });
  }
  try {
    const job = await startImages(yfId);
    if (job.claimed) {
      after(async () => {
        try {
          await job.run();
        } catch (err) {
          console.error(`[api/fleet/${yfId}/images/prepare] preparation failed`, err);
        }
      });
    }
    return NextResponse.json({ ...job.response, claimed: job.claimed }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error(`[api/fleet/${yfId}/images/prepare]`, err);
    const code = (err as { code?: string })?.code;
    return NextResponse.json(
      { error: `This yacht's images could not be prepared. ${describeFleetFailure(err)}` },
      { status: code === "STORAGE" ? 503 : 502 }
    );
  }
}
