import { NextRequest, NextResponse } from "next/server";
import { expectedCookieValue, isPortalAuthed } from "@/server/portal-auth";
import { importConsultantSeed } from "@/server/consultant-import.mjs";
import { listConsultants } from "@/server/consultants.mjs";
import { storageMode } from "@/server/storage.mjs";
import { CONSULTANT_SEED_ROWS } from "@/data/consultants-seed";
import type { ConsultantImportResult } from "@/lib/consultant-seed-types";
import type { ConsultantSummary } from "@/lib/consultant-types";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
// Twenty HEAD requests to the CDN plus the Blob writes: well inside a minute.
export const maxDuration = 60;

/**
 * Guard: PORTAL_ACCESS_KEY only, server-side, exactly as the other
 * protected routes check it — with one deliberate difference. Those routes
 * treat an UNSET key as "gate disabled, let everyone through", which for a
 * route that writes records would leave the import open to any visitor. So
 * this one fails closed: no key configured, no import.
 *
 * TODO(auth): once Microsoft sign-in lands, replace this with
 * requireAdminSession() (PORTAL_ADMIN_EMAILS) like the other
 * /api/admin/consultants routes, and move the page behind isAdmin.
 */
function requireAccessKey(request: NextRequest): NextResponse | null {
  if (!expectedCookieValue()) {
    return NextResponse.json({ error: "PORTAL_ACCESS_KEY is not set in this environment, so the import is closed. Set it and sign in at /portal/login first." }, { status: 403 });
  }
  if (!isPortalAuthed(request)) {
    return NextResponse.json({ error: "Staging access required — sign in at /portal/login." }, { status: 401 });
  }
  return null;
}

/** Store id embedded in a Vercel Blob token (vercel_blob_rw_<storeId>_<secret>); never the secret. */
function blobStoreId(): string | null {
  const token = process.env.PORTAL_DATA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || "";
  const m = token.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? m[1] : null;
}

export interface ImportStatus {
  seedRows: number;
  existingRecords: number;
  /** How many seed emails already have a record — what a press would skip */
  alreadyImported: number;
  backend: string;
  blobStoreId: string | null;
  /** "production" | "preview" | "development" | null outside Vercel */
  vercelEnv: string | null;
  vercelUrl: string | null;
}

/** What a press would do, and where the writes would go. */
export async function GET(request: NextRequest) {
  const denied = requireAccessKey(request);
  if (denied) return denied;
  try {
    const rows = (await listConsultants()) as ConsultantSummary[];
    const have = new Set(rows.map((r) => r.email));
    const status: ImportStatus = {
      seedRows: CONSULTANT_SEED_ROWS.length,
      existingRecords: rows.length,
      alreadyImported: CONSULTANT_SEED_ROWS.filter((r) => have.has(r.email)).length,
      backend: storageMode().data,
      blobStoreId: blobStoreId(),
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelUrl: process.env.VERCEL_URL ?? null,
    };
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: `The consultant index could not be read: ${String((err as Error)?.message ?? err)}` }, { status: 503 });
  }
}

/** Run the seed import against the app's own DATA store. Safe to call repeatedly. */
export async function POST(request: NextRequest) {
  const denied = requireAccessKey(request);
  if (denied) return denied;
  if (!rateLimit("import-consultants", clientIp(request), 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const result = (await importConsultantSeed(CONSULTANT_SEED_ROWS, {
      updatedBy: "import:consultants-seed.csv",
      log: (line: string) => console.log(`[import-consultants] ${line}`),
    })) as ConsultantImportResult;
    return NextResponse.json({ result, blobStoreId: blobStoreId(), vercelEnv: process.env.VERCEL_ENV ?? null });
  } catch (err) {
    return NextResponse.json({ error: `The import stopped: ${String((err as Error)?.message ?? err)}. Records created before the failure are kept; press again to continue — they will be skipped.` }, { status: 503 });
  }
}
