import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { listConsultants } from "@/server/consultants.mjs";
import type { ConsultantSummary } from "@/lib/consultant-types";

export const runtime = "nodejs";

/**
 * Active consultants for the creation picker: id, display name and job
 * title, sorted by display name. Nothing else about a colleague leaves the
 * server here.
 */
export async function GET(request: NextRequest) {
  const session = requirePortalSession(request);
  if (!session.ok) return session.response;
  try {
    const rows = (await listConsultants()) as ConsultantSummary[];
    const consultants = rows
      .filter((r) => r.status === "active" && r.displayName)
      .map((r) => ({ id: r.id, displayName: r.displayName, jobTitle: r.jobTitle }));
    return NextResponse.json({ consultants });
  } catch (err) {
    return errorResponse(err);
  }
}
