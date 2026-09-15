import { NextRequest, NextResponse } from "next/server";
import {
  MICROSOFT_COOKIE,
  MICROSOFT_FLOW_COOKIE,
  NO_RECORD_ERROR,
  completeSignIn,
  makeSessionCookieValue,
  microsoftConfig,
} from "@/server/auth/microsoft";
import { authProvider } from "@/server/auth";
import { findConsultantByEmail, findConsultantByObjectId } from "@/server/consultants.mjs";
import { requestOrigin } from "@/server/auth/origin";

export const runtime = "nodejs";

/**
 * Second leg of Microsoft sign-in. Exchanges the code, validates the ID
 * token, then admits the person ONLY if a consultant record exists for
 * them — matched on object ID first, then on the sign-in address. Anyone
 * else is sent back to the sign-in page with a message to contact
 * marketing and no session cookie. The record itself is claimed (object
 * ID written in) by consultant-session.ts on the first portal request.
 */
export async function GET(request: NextRequest) {
  const signIn = new URL("/portal/sign-in", request.url);
  if (authProvider().name !== "microsoft") return NextResponse.redirect(signIn);
  const config = microsoftConfig();
  if (!config) {
    signIn.searchParams.set("error", "not-configured");
    return NextResponse.redirect(signIn);
  }

  const clearFlow = (response: NextResponse) => {
    response.cookies.set(MICROSOFT_FLOW_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  };

  let completed;
  try {
    completed = await completeSignIn(config, requestOrigin(request), request.nextUrl.searchParams, request.cookies.get(MICROSOFT_FLOW_COOKIE)?.value);
  } catch (err) {
    console.warn(`[auth/microsoft] sign-in failed: ${String((err as Error)?.message ?? err)}`);
    signIn.searchParams.set("error", "failed");
    signIn.searchParams.set("detail", String((err as Error)?.message ?? "Sign-in failed.").slice(0, 200));
    return clearFlow(NextResponse.redirect(signIn));
  }

  const { identity, next } = completed;
  try {
    const record = (await findConsultantByObjectId(identity.id)) ?? (identity.email ? await findConsultantByEmail(identity.email, { activeOnly: true }) : null);
    if (!record) {
      console.warn(`[auth/microsoft] no consultant record for ${identity.email || identity.id}; refused.`);
      signIn.searchParams.set("error", NO_RECORD_ERROR);
      return clearFlow(NextResponse.redirect(signIn));
    }
  } catch (err) {
    console.warn(`[auth/microsoft] consultant lookup failed: ${String((err as Error)?.message ?? err)}`);
    signIn.searchParams.set("error", "failed");
    signIn.searchParams.set("detail", "The consultant directory could not be read. Please try again.");
    return clearFlow(NextResponse.redirect(signIn));
  }

  const response = clearFlow(NextResponse.redirect(new URL(next, request.url)));
  response.cookies.set(MICROSOFT_COOKIE, makeSessionCookieValue(config, identity), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
