import { NextRequest, NextResponse } from "next/server";
import { demoAtlasConfig, DEMO_TIER2_SLUG } from "@/server/demo/harrington";
import { requirePortalSession } from "@/server/auth";

export const runtime = "nodejs";

/** The demo Tier 2 page config (what /atlas/harrington-summer-2027 renders when nothing is published there). */
export async function GET(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  return NextResponse.json({ slug: DEMO_TIER2_SLUG, config: demoAtlasConfig() });
}
