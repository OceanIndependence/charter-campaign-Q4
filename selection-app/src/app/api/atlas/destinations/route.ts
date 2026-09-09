import { NextRequest, NextResponse } from "next/server";
import { atlasGeneratedAt, listDestinationOptions } from "@/server/atlas/content";
import { requirePortalSession } from "@/server/auth";

export const runtime = "nodejs";

/** Every 2027 Atlas destination id for the Tier 2 destination pickers (Mediterranean first). */
export async function GET(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  return NextResponse.json(
    { generatedAt: atlasGeneratedAt(), destinations: listDestinationOptions() },
    { headers: { "cache-control": "private, max-age=3600" } }
  );
}
