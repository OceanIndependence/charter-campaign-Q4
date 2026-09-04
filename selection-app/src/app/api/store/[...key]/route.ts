import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { localPath } from "@/server/storage.mjs";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
};

/**
 * Serves files from the local filesystem store — development fallback when
 * no Vercel Blob store is configured (in blob mode URLs point straight at
 * the blob CDN and this route is never referenced).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { key } = await params;
  const rel = key.join("/");
  const file = localPath(rel);
  // localPath anchors under .portal-store; reject any traversal attempt.
  if (rel.split("/").some((part) => part === ".." || part === "")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const body = await readFile(file);
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(body, {
      headers: { "content-type": type, "cache-control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
