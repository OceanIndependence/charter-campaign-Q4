import type { NextRequest } from "next/server";

/** The public origin the browser actually used, as Vercel forwards it. */
export function requestOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  return `${proto}://${host}`;
}

/**
 * The single origin every Microsoft sign-in runs on.
 *
 * Entra matches redirect URIs exactly and accepts no wildcards, while Vercel
 * gives each deployment its own host (charter-campaign-q4-<hash>-<team>.
 * vercel.app). Signing in from one of those sends Entra a redirect URI it has
 * never seen, which is AADSTS50011. So the flow is pinned to one registered
 * origin: the start route bounces the browser there first, and both legs then
 * agree on the redirect URI and share the flow cookie.
 *
 * PORTAL_PUBLIC_ORIGIN wins when set (a custom domain, or a preview host you
 * have registered deliberately). Otherwise Vercel's own stable production
 * domain, which is the same value on every deployment including previews.
 * Otherwise the request's origin, which is what local development wants.
 */
export function signInOrigin(request: NextRequest): string {
  const configured = normalise(process.env.PORTAL_PUBLIC_ORIGIN);
  if (configured) return configured;
  const production = normalise(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (production) return production;
  return requestOrigin(request);
}

/** `example.com`, `https://example.com` and `https://example.com/` all become `https://example.com`. */
function normalise(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    console.warn(`[auth/microsoft] ignoring unreadable sign-in origin: ${raw}`);
    return null;
  }
}
