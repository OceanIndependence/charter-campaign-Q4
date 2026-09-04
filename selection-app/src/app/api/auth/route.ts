import { NextRequest, NextResponse } from "next/server";
import { PORTAL_COOKIE, checkAccessKey, expectedCookieValue } from "@/server/portal-auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!rateLimit("auth", clientIp(request), 10, 60_000)) {
    return NextResponse.json({ error: "Too many attempts — try again shortly." }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  if (!key || !checkAccessKey(key)) {
    return NextResponse.json({ error: "That access key is not recognised." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PORTAL_COOKIE, expectedCookieValue() as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PORTAL_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
