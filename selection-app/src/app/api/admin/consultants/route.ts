import { NextRequest, NextResponse } from "next/server";
import { ownerEmail, requireAdminSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { emptyConsultantRecord, listConsultants, newConsultantId, stampConsultant, writeConsultantRecord } from "@/server/consultants.mjs";
import { adminEmail, adminText } from "@/server/consultant-admin";
import type { ConsultantRecord, ConsultantSummary } from "@/lib/consultant-types";

export const runtime = "nodejs";

/**
 * Consultant admin — guarded server-side by the resolved portal role
 * (requireAdminSession), unlike the operator routes beside it which take
 * the CRON_SECRET bearer. Admins never see or set phone or WhatsApp: the
 * list is the index (which omits them) and the create path leaves them
 * blank for the consultant to fill in on first sign-in.
 */

/**
 * Every record's index row (no phone or WhatsApp), by display name, plus
 * what the ADMIN column needs to render: the caller's own role, and the
 * owner's address so the owner's row (if there is one) can show a fixed
 * chip instead of a control. Both come from the server — the client never
 * decides who may toggle, it only draws what it is told.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminSession(request);
    if (!session.ok) return session.response;
    return NextResponse.json({
      consultants: (await listConsultants()) as ConsultantSummary[],
      role: session.role,
      ownerEmail: ownerEmail(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Add a consultant who has not yet signed in: display name, job title and
 * email. The record is created with a null objectId and is claimed on that
 * person's first sign-in by the email match in consultant-session.ts.
 */
export async function POST(request: NextRequest) {
  if (!rateLimit("admin-consultants", clientIp(request), 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const session = await requireAdminSession(request);
    if (!session.ok) return session.response;
    const body = await request.json().catch(() => ({}));
    const record: ConsultantRecord = {
      ...(emptyConsultantRecord(newConsultantId()) as ConsultantRecord),
      objectId: null,
      email: adminEmail(body?.email, true),
      displayName: adminText(body?.displayName, "Display name", true),
      jobTitle: adminText(body?.jobTitle, "Job title"),
      photoUrl: "",
      photoStatus: "missing",
      source: "admin",
      status: "active",
    };
    stampConsultant(record, `admin:${session.identity.email || session.identity.id}`);
    const stored = (await writeConsultantRecord(record)) as ConsultantRecord;
    const { phone: _p, whatsapp: _w, ...row } = stored;
    return NextResponse.json({ consultant: row }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
