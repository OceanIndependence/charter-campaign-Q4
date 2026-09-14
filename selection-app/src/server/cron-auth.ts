import { NextRequest, NextResponse } from "next/server";

/**
 * Gate for operator-only routes (the admin rebuild and backfill routes):
 * "Authorization: Bearer $CRON_SECRET" and nothing else. Unlike the cron
 * route there is no portal-session alternative, so with the solo provider
 * and no PORTAL_ACCESS_KEY these routes are still closed. Without a secret
 * they are open only outside production, for local use.
 */
export function requireCronSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  if (secret && bearer === `Bearer ${secret}`) return null;
  if (!secret && process.env.NODE_ENV !== "production") return null;
  return NextResponse.json({ error: "Not authorised." }, { status: 401 });
}
