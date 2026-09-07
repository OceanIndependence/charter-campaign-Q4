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
};

// Only these public-asset prefixes/extensions are servable — never the
// private DATA store (drafts, page configs).
const SERVABLE = [
  { prefix: "yachtfolio/images/", ext: /\.(jpe?g|png|webp)$/i },
];

/**
 * Serves processed IMAGES from the local filesystem store —
 * development fallback when no public Blob store is configured (in blob mode
 * these URLs point straight at the blob CDN and this route is never
 * referenced). It only ever serves public-asset keys.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (process.env.YFIMAGES_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { key } = await params;
  const rel = key.join("/");
  const traversal = rel.split("/").some((part) => part === ".." || part === "");
  const allowed = SERVABLE.some((s) => rel.startsWith(s.prefix) && s.ext.test(rel));
  if (traversal || !allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const file = localPath(rel);
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
