/**
 * DEVELOPMENT-ONLY auth stub — SERVER-ONLY.
 *
 * Lets you sign in as one of a few fixed fake consultants so ownership can be
 * exercised (build/publish as A, confirm B cannot see A's work) before real
 * Microsoft 365 sign-in exists. It is impossible to use in production:
 *  - the module refuses to mint or read a session when NODE_ENV=production
 *    (defence in depth), and
 *  - the provider selector (./index) never chooses the stub in production.
 *
 * The session cookie holds the chosen identity id plus an HMAC so it cannot
 * be forged to an arbitrary value; only ids in the fixed list resolve. This
 * mirrors the real provider's "validate before trusting the cookie" shape.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthProvider, ConsultantIdentity } from "./types";

export const STUB_COOKIE = "oi_portal_identity";

/** Fixed fake consultants. ids stand in for Microsoft object IDs. */
export const STUB_IDENTITIES: ConsultantIdentity[] = [
  { id: "stub-lucy", email: "lucy@ocyachts.com", name: "Lucy Harrington" },
  { id: "stub-james", email: "james@ocyachts.com", name: "James Fenwick" },
  { id: "stub-priya", email: "priya@ocyachts.com", name: "Priya Anand" },
];

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function secret(): string {
  // Dev-only signing key; the real provider uses PORTAL_SESSION_SECRET.
  return process.env.PORTAL_SESSION_SECRET || "dev-stub-session-secret";
}

function sign(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const stubProvider: AuthProvider = {
  name: "stub",
  isStub: true,
  lockedReason: null,
  cookieName: STUB_COOKIE,

  getIdentity(cookieValue) {
    if (isProduction() || !cookieValue) return null;
    const [id, mac] = cookieValue.split(".");
    if (!id || !mac) return null;
    const identity = STUB_IDENTITIES.find((i) => i.id === id);
    if (!identity) return null;
    if (!safeEqual(mac, sign(id))) return null;
    return identity;
  },

  selectableIdentities() {
    return isProduction() ? [] : STUB_IDENTITIES;
  },

  makeSessionCookie(id) {
    if (isProduction()) return null;
    const identity = STUB_IDENTITIES.find((i) => i.id === id);
    if (!identity) return null;
    return { name: STUB_COOKIE, value: `${id}.${sign(id)}` };
  },
};
