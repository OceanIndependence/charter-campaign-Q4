import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/auth";
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
 * Guard: PORTAL_ADMIN_EMAILS, server-side (requireAdminSession) — the same
 * check as the consultant admin screen. With Microsoft sign-in the tenant
 * is the front door, so the earlier PORTAL_ACCESS_KEY guard is gone.
 */
async function requireAccessKey(request: NextRequest): Promise<NextResponse | null> {
  const session = await requireAdminSession(request);
  return session.ok ? null : session.response;
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
  const denied = await requireAccessKey(request);
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
  const denied = await requireAccessKey(request);
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
