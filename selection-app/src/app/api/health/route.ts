import { NextRequest, NextResponse } from "next/server";
import { fleetDiagnostics, getFleet } from "@/server/fleet.mjs";
import { requirePortalAuth } from "@/server/portal-auth";
import { storageMode } from "@/server/storage.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-URL health check for the portal's moving parts (consultant-authed).
 * Reports, without exposing any secret: whether the passkey and storage are
 * configured, which storage backend is active, the last storage error, and
 * whether the fleet cache can be served right now.
 */
export async function GET(request: NextRequest) {
  const denied = requirePortalAuth(request);
  if (denied) return denied;

  const imagesConfigured = Boolean(
    process.env.YFIMAGES_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN
  );
  const dataConfigured = Boolean(
    process.env.PORTAL_DATA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN
  );

  const checks: Record<string, unknown> = {
    storage: storageMode(),
    imagesStoreConfigured: imagesConfigured,
    dataStoreConfigured: dataConfigured,
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    ...fleetDiagnostics(),
  };

  try {
    const fleet = await getFleet();
    checks.fleet = { ok: true, count: fleet?.count ?? 0, syncedAt: fleet?.syncedAt ?? null };
  } catch (err) {
    checks.fleet = { ok: false, error: String((err as Error)?.message ?? err) };
  }
  // Refresh after the fleet attempt — it may have recorded a storage error.
  Object.assign(checks, fleetDiagnostics());

  const healthy = (checks.fleet as { ok: boolean }).ok && (checks.lastStorageError ?? null) === null;
  return NextResponse.json(checks, { status: healthy ? 200 : 503 });
}
