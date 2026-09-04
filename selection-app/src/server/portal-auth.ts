/**
 * Consultant-session gate for the Charter Portal and its API routes.
 *
 * Staging model: a single shared access key (PORTAL_ACCESS_KEY, server-only
 * env var). /portal/login exchanges the key for an httpOnly cookie holding
 * its SHA-256 digest; every portal API route calls requirePortalAuth().
 * Real per-consultant auth replaces this at sign-off — the gate is a single
 * choke point so the swap is one file.
 *
 * In production the gate DENIES when PORTAL_ACCESS_KEY is unset (a deployed
 * open proxy onto Yachtfolio is worse than a broken form). In development it
 * allows, so local work needs no env.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const PORTAL_COOKIE = "oi_portal_session";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function expectedCookieValue(): string | null {
  const key = process.env.PORTAL_ACCESS_KEY;
  return key ? digest(key) : null;
}

export function checkAccessKey(candidate: string): boolean {
  const key = process.env.PORTAL_ACCESS_KEY;
  return Boolean(key) && safeEqual(candidate, key as string);
}

export function isPortalAuthed(request: NextRequest): boolean {
  const expected = expectedCookieValue();
  if (!expected) return process.env.NODE_ENV !== "production";
  const cookie = request.cookies.get(PORTAL_COOKIE)?.value;
  if (cookie && safeEqual(cookie, expected)) return true;
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && checkAccessKey(bearer.slice(7))) return true;
  return false;
}

/** Same check for server components (reads the request cookies). */
export async function isPortalAuthedServer(): Promise<boolean> {
  const expected = expectedCookieValue();
  if (!expected) return process.env.NODE_ENV !== "production";
  const store = await cookies();
  const value = store.get(PORTAL_COOKIE)?.value;
  return Boolean(value && safeEqual(value, expected));
}

/** Return a 401 response, or null when the request is authenticated. */
export function requirePortalAuth(request: NextRequest): NextResponse | null {
  if (isPortalAuthed(request)) return null;
  return NextResponse.json({ error: "Not signed in to the Charter Portal." }, { status: 401 });
}
