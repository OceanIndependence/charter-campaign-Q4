import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail, requireOwnerSession } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { readConsultantRecord, stampConsultant, writeConsultantRecord } from "@/server/consultants.mjs";
import type { ConsultantRecord, ConsultantSummary } from "@/lib/consultant-types";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

const summaryOf = (r: ConsultantRecord): ConsultantSummary => {
  const { phone: _p, whatsapp: _w, version: _v, ...row } = r;
  return row;
};

/**
 * Grant or revoke admin for ONE consultant: { isAdmin: boolean }.
 *
 * Owner-only (requireOwnerSession). An admin may see who is an admin and
 * may not change it, and that is enforced here rather than by hiding the
 * checkbox — the column is read-only for an admin in the UI, but this is
 * what actually refuses the request.
 *
 * It reads that one record and writes that one record back, rather than
 * saving the list: Blob is last-write-wins, so rewriting the collection
 * would silently drop a colleague's concurrent edit to another row.
 *
 * Separate from PUT /api/admin/consultants/[id], which any admin may call,
 * because the fields it accepts and the role it demands are different. The
 * three admin fields are never accepted by that route.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  if (!rateLimit("admin-consultants", clientIp(request), 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const session = await requireOwnerSession(request, "change admin access");
    if (!session.ok) return session.response;
    const { id } = await params;
    const existing = (await readConsultantRecord(id)) as ConsultantRecord | null;
    if (!existing) return NextResponse.json({ error: "No such consultant record." }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    if (typeof body?.isAdmin !== "boolean") {
      return NextResponse.json({ error: "isAdmin must be true or false." }, { status: 400 });
    }
    const grant: boolean = body.isAdmin;

    // The owner's access comes from the environment, not from a record, so
    // a record that happens to carry the owner's address has nothing to
    // toggle. Refused here as well as hidden in the UI: there must be no
    // request that can take the owner's access away.
    if (isOwnerEmail(existing.email)) {
      return NextResponse.json(
        { error: "This is the portal owner. Owner access is set by PORTAL_OWNER_EMAIL and cannot be changed here." },
        { status: 400 }
      );
    }
    // An inactive record never resolves to admin, so granting one would be
    // a tick that does nothing. Revoking stays open whatever the status.
    if (grant && existing.status !== "active") {
      return NextResponse.json(
        { error: `${existing.displayName || "This consultant"} is inactive. Make the record active before granting admin access.` },
        { status: 400 }
      );
    }

    const ownerAddress = String(session.identity.email ?? "").trim().toLowerCase();
    const next: ConsultantRecord = {
      ...existing,
      isAdmin: grant,
      adminGrantedBy: grant ? ownerAddress : "",
      adminGrantedAt: grant ? new Date().toISOString() : null,
    };
    stampConsultant(next, `admin:${ownerAddress || session.identity.id}`);
    const stored = (await writeConsultantRecord(next)) as ConsultantRecord;
    return NextResponse.json({ consultant: summaryOf(stored) });
  } catch (err) {
    return errorResponse(err);
  }
}
