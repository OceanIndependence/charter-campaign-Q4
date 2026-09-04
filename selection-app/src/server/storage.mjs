/**
 * Durable storage for the Charter Portal — SERVER-ONLY.
 *
 * Holds the nightly fleet cache, on-demand processed yacht images, form
 * drafts and versioned published page configs.
 *
 * Backend selection:
 *  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production/staging).
 *  - Local filesystem (.portal-store/, git-ignored) otherwise — for
 *    development; files are served through /api/store/[...key].
 *
 * Mutable JSON reads add a unique query string to bypass the blob CDN cache
 * so read-after-write (draft autosave → preview) stays consistent. Image
 * keys embed the Yachtfolio file id, so image URLs are immutable and can be
 * cached hard.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const FS_ROOT = process.env.PORTAL_STORE_DIR ?? path.join(process.cwd(), ".portal-store");

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Which backend is active — for diagnostics only. */
export function storageMode() {
  return useBlob() ? "blob" : "filesystem";
}

async function blob() {
  return import("@vercel/blob");
}

/** Store a JSON document at `key` (e.g. "portal/drafts/abc.json"). */
export async function putJson(key, value) {
  const body = JSON.stringify(value, null, 2);
  if (useBlob()) {
    const { put } = await blob();
    await put(key, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  } else {
    const file = path.join(FS_ROOT, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, "utf8");
  }
}

/** Read a JSON document, or null when absent. */
export async function getJson(key) {
  if (useBlob()) {
    const { head, BlobNotFoundError } = await blob();
    try {
      const meta = await head(key);
      const url = new URL(meta.url);
      url.searchParams.set("v", String(Date.now())); // bypass CDN cache for mutable JSON
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }
  const file = path.join(FS_ROOT, key);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Store a binary file (processed image); returns its public URL. Keys must
 * be immutable (content identity in the name) — they are cached for a year.
 */
export async function putFile(key, buffer, contentType) {
  if (useBlob()) {
    const { put } = await blob();
    const res = await put(key, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      cacheControlMaxAge: 31536000,
    });
    return res.url;
  }
  const file = path.join(FS_ROOT, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer);
  return `/api/store/${key}`;
}

/** True when a file already exists at `key` (used to skip reprocessing). */
export async function fileExists(key) {
  if (useBlob()) {
    const { head, BlobNotFoundError } = await blob();
    try {
      await head(key);
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      throw err;
    }
  }
  return existsSync(path.join(FS_ROOT, key));
}

/** Public URL for an existing file key (same logic as putFile's return). */
export async function fileUrl(key) {
  if (useBlob()) {
    const { head, BlobNotFoundError } = await blob();
    try {
      const meta = await head(key);
      return meta.url;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }
  return existsSync(path.join(FS_ROOT, key)) ? `/api/store/${key}` : null;
}

/** List keys under a prefix (e.g. published page versions). */
export async function listKeys(prefix) {
  if (useBlob()) {
    const { list } = await blob();
    const out = [];
    let cursor;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      out.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(FS_ROOT, prefix);
  if (!existsSync(dir)) return [];
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  return names.filter((d) => d.isFile()).map((d) => path.join(prefix, path.relative(dir, path.join(d.parentPath ?? d.path, d.name))));
}

/** Absolute path of a locally stored file (filesystem backend only). */
export function localPath(key) {
  return path.join(FS_ROOT, key);
}
