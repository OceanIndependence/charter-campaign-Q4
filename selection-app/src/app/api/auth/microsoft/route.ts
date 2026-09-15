import { NextRequest, NextResponse } from "next/server";
import { beginSignIn, microsoftConfig } from "@/server/auth/microsoft";
import { authProvider } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { requestOrigin } from "@/server/auth/origin";

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
  const origin = requestOrigin(request);
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
