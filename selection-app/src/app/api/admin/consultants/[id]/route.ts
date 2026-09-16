import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail, requireAdminSession, requireOwnerSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { checkPhotoDetail, deleteConsultantRecord, readConsultantRecord, stampConsultant, writeConsultantRecord } from "@/server/consultants.mjs";
import { readIndex } from "@/server/pages.mjs";
import type { ConsultantRecord, ConsultantSummary, PhotoStatus } from "@/lib/consultant-types";
import { adminEmail, adminText } from "@/server/consultant-admin";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

const summaryOf = (r: ConsultantRecord): ConsultantSummary => {
  const { phone: _p, whatsapp: _w, version: _v, ...row } = r;
  return row;
};

/**
 * Edit a consultant record as an admin: display name, job title, email,
 * photo URL and status, plus "release" (clear the objectId so the record
 * can be claimed by the right sign-in). Phone and WhatsApp are never
 * accepted here, not even for the admin's own record. Every change stamps
 * updatedAt and updatedBy; there is no audit log beyond this. Deletion is
 * not offered: a record that should disappear from client pages is set
 * inactive. isAdmin, adminGrantedBy and adminGrantedAt are never accepted
 * here either — only the owner changes those, on
 * PUT /api/admin/consultants/[id]/admin. Each field below is copied across
 * by name, so nothing in the body can reach the record on its own.
 *
 * Body (all optional): { displayName, jobTitle, email, photoUrl, status,
 * releaseObjectId: true, recheckPhoto: true }. The photo is HEAD-checked
 * whenever its URL changes (or recheckPhoto is set) and the result is
 * returned so the form can show it before the client page ever does.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  if (!rateLimit("admin-consultants", clientIp(request), 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const session = await requireAdminSession(request);
    if (!session.ok) return session.response;
    const { id } = await params;
    const existing = (await readConsultantRecord(id)) as ConsultantRecord | null;
    if (!existing) return NextResponse.json({ error: "No such consultant record." }, { status: 404 });
    const body = await request.json().catch(() => ({}));

    const next: ConsultantRecord = { ...existing };
    if ("displayName" in body) next.displayName = adminText(body.displayName, "Display name", true);
    if ("jobTitle" in body) next.jobTitle = adminText(body.jobTitle, "Job title");
    if ("email" in body) next.email = adminEmail(body.email, false);
    if ("status" in body) {
      if (body.status !== "active" && body.status !== "inactive") throw Object.assign(new Error("Status must be active or inactive."), { code: "INVALID" });
      next.status = body.status;
    }
    if (body?.releaseObjectId === true) next.objectId = null;

    type PhotoCheck = { status: PhotoStatus; httpStatus: number | null; error: string | null };
    let photo: PhotoCheck | null = null;
    if ("photoUrl" in body) {
      const url = String(body.photoUrl ?? "").trim();
      if (url && !/^https:\/\//i.test(url)) throw Object.assign(new Error("The photo URL must start with https://."), { code: "INVALID" });
      next.photoUrl = url;
    }
    if (next.photoUrl !== existing.photoUrl || body?.recheckPhoto === true) {
      const checked: PhotoCheck = next.photoUrl ? ((await checkPhotoDetail(next.photoUrl)) as PhotoCheck) : { status: "missing", httpStatus: null, error: "No URL." };
      photo = checked;
      next.photoStatus = checked.status;
    }

    stampConsultant(next, `admin:${session.identity.email || session.identity.id}`);
    const stored = (await writeConsultantRecord(next)) as ConsultantRecord;
    return NextResponse.json({ consultant: summaryOf(stored), photo });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Remove a consultant record entirely. Owner-only, and deliberately narrow.
 *
 * Setting a record inactive is still the way to retire a real consultant —
 * selections live under portal/selections/<consultantId>/, so deleting a
 * record that owns any would orphan them with no way back. This exists for
 * records that were never usable: the email-less strays a misconfigured
 * sign-in used to mint (one per object ID), which cannot be claimed, cannot
 * be matched, and appear in the admin list and the creation picker as
 * duplicates of a real person.
 *
 * Refused for the owner's own record, and for any record that owns even one
 * selection — that is the guard that keeps the original reasoning intact.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!rateLimit("admin-consultants", clientIp(request), 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const session = await requireOwnerSession(request, "remove a consultant record");
    if (!session.ok) return session.response;
    const { id } = await params;
    const existing = (await readConsultantRecord(id)) as ConsultantRecord | null;
    if (!existing) return NextResponse.json({ error: "No such consultant record." }, { status: 404 });

    if (isOwnerEmail(existing.email)) {
      return NextResponse.json({ error: "This is the portal owner's own record and cannot be removed." }, { status: 400 });
    }
    const selections = Object.keys((await readIndex(id)).items ?? {}).length;
    if (selections > 0) {
      return NextResponse.json(
        {
          error: `${existing.displayName || "This consultant"} owns ${selections} selection${selections === 1 ? "" : "s"}, so the record cannot be removed. Set it inactive instead.`,
        },
        { status: 409 }
      );
    }

    await deleteConsultantRecord(id);
    console.info(`[admin] ${session.identity.email} removed consultant record ${id} (${existing.email || "no email"}, ${existing.displayName || "no name"}).`);
    return NextResponse.json({ removed: id });
  } catch (err) {
    return errorResponse(err);
  }
}
