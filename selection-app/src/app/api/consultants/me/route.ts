import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { stampConsultant, writeConsultantRecord } from "@/server/consultants.mjs";
import type { ConsultantRecord } from "@/lib/consultant-types";

export const runtime = "nodejs";

const MAX_NUMBER_LENGTH = 40;
/** Digits, spaces, plus, brackets, hyphens and dots: enough for any international number as people type it. */
const NUMBER_RE = /^[+\d][\d\s().-]*$/;

function cleanNumber(value: unknown, label: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.length > MAX_NUMBER_LENGTH || !NUMBER_RE.test(v)) {
    throw Object.assign(new Error(`${label} should be a phone number, such as +41 44 000 00 00.`), { code: "INVALID" });
  }
  return v;
}

/** The signed-in consultant's own record. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireConsultantSession(request);
    if (!session.ok) return session.response;
    return NextResponse.json({ consultant: session.consultant });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * The consultant edits their phone and WhatsApp numbers and nothing else:
 * every other field in the body is ignored. An inactive record is read-only.
 */
export async function PUT(request: NextRequest) {
  if (!rateLimit("consultant-me", clientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const session = await requireConsultantSession(request);
    if (!session.ok) return session.response;
    const { consultant, identity } = session;
    if (consultant.status !== "active") {
      return NextResponse.json({ error: "This profile is inactive and cannot be edited. Contact marketing." }, { status: 409 });
    }
    const body = await request.json().catch(() => ({}));
    const next: ConsultantRecord = {
      ...consultant,
      phone: cleanNumber(body?.phone, "Phone"),
      whatsapp: cleanNumber(body?.whatsapp, "WhatsApp"),
    };
    stampConsultant(next, consultant.email || identity.email || identity.id);
    const stored = (await writeConsultantRecord(next)) as ConsultantRecord;
    return NextResponse.json({ consultant: stored });
  } catch (err) {
    return errorResponse(err);
  }
}
