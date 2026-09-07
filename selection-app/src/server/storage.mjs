/**
 * Durable storage for the Charter Portal — SERVER-ONLY.
 *
 * Two separate concerns, deliberately kept in two Vercel Blob stores:
 *
 *  - IMAGES (public): processed yacht images. Written with access "public"
 *    so the browser loads them directly by URL on the portal and on client
 *    pages. Token: YFIMAGES_READ_WRITE_TOKEN.
 *
 *  - DATA (private): form drafts, versioned published page configs, and the
 *    Yachtfolio fleet/reference/detail caches. Written with access
 *    "private" and only ever read back SERVER-SIDE (via the SDK's
 *    authenticated `get`), through the auth-gated API routes and the
 *    /selection/[slug] server render. The raw private URL never reaches a
 *    browser. Token: PORTAL_DATA_READ_WRITE_TOKEN (falls back to the
 *    default BLOB_READ_WRITE_TOKEN so an existing single private store keeps
 *    working).
 *
 * Either store falls back to the local filesystem (.portal-store/,
 * git-ignored) when its token is absent — for development. Mutable JSON is
 * read with caching off so read-after-write (autosave → preview) is
 * consistent; image keys embed the Yachtfolio file id, so image URLs are
 * immutable and cached hard.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

const FS_ROOT = process.env.PORTAL_STORE_DIR ?? path.join(process.cwd(), ".portal-store");

/** Token for the private DATA store (drafts, page configs, fleet caches). */
function dataToken() {
  return process.env.PORTAL_DATA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || null;
}

/** Token for the public IMAGES store (processed yacht images). */
function imagesToken() {
  return process.env.YFIMAGES_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || null;
}

/** Which backend each concern is using — for diagnostics only. */
export function storageMode() {
  return {
    data: dataToken() ? "blob (private)" : "filesystem",
    images: imagesToken() ? "blob (public)" : "filesystem",
  };
}

async function blob() {
  return import("@vercel/blob");
}

/* --------------------------------------------------- DATA (private JSON) */

/** Store a JSON document at `key` (e.g. "portal/drafts/abc.json"). */
export async function putJson(key, value) {
  const body = JSON.stringify(value, null, 2);
  const token = dataToken();
  if (token) {
    const { put } = await blob();
    await put(key, body, {
      access: "private",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
    return;
  }
  const file = path.join(FS_ROOT, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, "utf8");
}

/** Read a JSON document server-side, or null when absent. */
export async function getJson(key) {
  const token = dataToken();
  if (token) {
    const { get, BlobNotFoundError } = await blob();
    try {
      // Authenticated private read; useCache off keeps mutable JSON fresh.
      const res = await get(key, { access: "private", token, useCache: false });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      const text = await new Response(res.stream).text();
      return JSON.parse(text);
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

/** Delete a JSON document from the DATA store (no-op when absent). */
export async function deleteJson(key) {
  const token = dataToken();
  if (token) {
    const { del } = await blob();
    await del(key, { token });
    return;
  }
  const file = path.join(FS_ROOT, key);
  if (existsSync(file)) await unlink(file);
}

/** List keys under a prefix in the DATA store. */
export async function listKeys(prefix) {
  const token = dataToken();
  if (token) {
    const { list } = await blob();
    const out = [];
    let cursor;
    do {
      const page = await list({ prefix, cursor, limit: 1000, token });
      out.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(FS_ROOT, prefix);
  if (!existsSync(dir)) return [];
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  return names
    .filter((d) => d.isFile())
    .map((d) => path.join(prefix, path.relative(dir, path.join(d.parentPath ?? d.path, d.name))));
}

/* ------------------------------------------------- IMAGES (public files) */

/**
 * Store a binary file (processed image) in the public store; returns its
 * public URL. Keys must be immutable (content identity in the name) — they
 * are cached for a year.
 */
export async function putFile(key, buffer, contentType) {
  const token = imagesToken();
  if (token) {
    const { put } = await blob();
    const res = await put(key, buffer, {
      access: "public",
      token,
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

/** Every file under a prefix in the IMAGES store, as [{ key, url }] — one call. */
export async function listImageFiles(prefix) {
  const token = imagesToken();
  if (token) {
    const { list } = await blob();
    const out = [];
    let cursor;
    do {
      const page = await list({ prefix, cursor, limit: 1000, token });
      out.push(...page.blobs.map((b) => ({ key: b.pathname, url: b.url })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(FS_ROOT, prefix);
  if (!existsSync(dir)) return [];
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  return names
    .filter((d) => d.isFile())
    .map((d) => {
      const key = path.join(prefix, path.relative(dir, path.join(d.parentPath ?? d.path, d.name)));
      return { key, url: `/api/store/${key}` };
    });
}

/** True when an image already exists at `key` (used to skip reprocessing). */
export async function fileExists(key) {
  const token = imagesToken();
  if (token) {
    const { head, BlobNotFoundError } = await blob();
    try {
      await head(key, { token });
      return true;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return false;
      throw err;
    }
  }
  return existsSync(path.join(FS_ROOT, key));
}

/** Public URL for an existing image key (same value putFile returned). */
export async function fileUrl(key) {
  const token = imagesToken();
  if (token) {
    const { head, BlobNotFoundError } = await blob();
    try {
      const meta = await head(key, { token });
      return meta.url;
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }
  return existsSync(path.join(FS_ROOT, key)) ? `/api/store/${key}` : null;
}

/** Absolute path of a locally stored file (filesystem backend only). */
export function localPath(key) {
  return path.join(FS_ROOT, key);
}
