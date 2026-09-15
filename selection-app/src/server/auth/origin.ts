import type { NextRequest } from "next/server";

/** The public origin the browser used, as Vercel forwards it — the base of the OAuth redirect URI. */
export function requestOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}
