import { NextRequest, NextResponse } from "next/server";
import { MICROSOFT_START_PATH, beginSignIn, microsoftConfig } from "@/server/auth/microsoft";
import { authProvider } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { requestOrigin, signInOrigin } from "@/server/auth/origin";

export const runtime = "nodejs";

/** First leg of Microsoft sign-in: set the flow cookie and send the browser to Microsoft. */
export async function GET(request: NextRequest) {
  if (authProvider().name !== "microsoft") {
    return NextResponse.redirect(new URL("/portal/sign-in", request.url));
  }
  if (!rateLimit("ms-signin", clientIp(request), 20, 60_000)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }
  const config = microsoftConfig();
  if (!config) return NextResponse.redirect(new URL("/portal/sign-in?error=not-configured", request.url));

  // Entra only knows one redirect URI, so run the whole flow on that origin.
  // A browser that arrived on a per-deployment preview host is sent there
  // first — before the flow cookie is set, so both legs share one host.
  const origin = signInOrigin(request);
  if (origin !== requestOrigin(request)) {
    const there = new URL(MICROSOFT_START_PATH, origin);
    const next = request.nextUrl.searchParams.get("next");
    if (next) there.searchParams.set("next", next);
    return NextResponse.redirect(there);
  }
  const { location, flowCookie } = beginSignIn(config, origin, request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(location);
  response.cookies.set(flowCookie.name, flowCookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: flowCookie.maxAge,
  });
  return response;
}
