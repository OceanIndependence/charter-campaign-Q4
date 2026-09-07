import { NextRequest, NextResponse } from "next/server";
import { authProvider, identityCookieName, stubSignInCookie } from "@/server/auth";
import { isPortalAuthed } from "@/server/portal-auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/**
 * Identity sign-in. The dev stub accepts a chosen identity id and sets the
 * identity cookie; the staging gate must already be passed. Real providers
 * (Microsoft) use a redirect flow instead of this endpoint.
 */
export async function POST(request: NextRequest) {
  if (!isPortalAuthed(request)) {
    return NextResponse.json({ error: "Staging access required." }, { status: 401 });
  }
  if (!rateLimit("identity", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }
  const provider = authProvider();
  if (!provider.isStub) {
    return NextResponse.json(
      { error: "This environment uses single sign-on; direct identity selection is disabled." },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const cookie = stubSignInCookie(id);
  if (!cookie) {
    return NextResponse.json({ error: "Unknown identity." }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

/** Sign out of the current identity (keeps the staging gate). */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(identityCookieName(), "", { path: "/", maxAge: 0 });
  return response;
}
