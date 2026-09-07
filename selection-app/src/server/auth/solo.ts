/**
 * Single-consultant provider — SERVER-ONLY.
 *
 * For staging (and any single-user internal deployment): every visitor is
 * one fixed, real consultant, signed in automatically with no picker and no
 * access key. Unlike the dev stub (fake, pickable identities, impossible in
 * production), this is one deliberately-configured real person, so it is
 * allowed to run in production when explicitly selected with
 * PORTAL_AUTH_PROVIDER=solo. Real multi-user sign-in still replaces it by
 * setting PORTAL_AUTH_PROVIDER=microsoft — no other change.
 *
 * The identity is fixed, so getIdentity ignores the cookie and always
 * returns it: there is nothing to pick or sign into.
 *
 * Env overrides (all optional; defaults below):
 *   PORTAL_SOLO_ID, PORTAL_SOLO_NAME, PORTAL_SOLO_EMAIL
 */

import type { AuthProvider, ConsultantIdentity } from "./types";

const DEFAULT_NAME = "Eleanor Bartoli Turner";
const DEFAULT_ID = "eleanor-bartoli-turner";
const DEFAULT_EMAIL = "";

function soloIdentity(): ConsultantIdentity {
  return {
    id: process.env.PORTAL_SOLO_ID || DEFAULT_ID,
    name: process.env.PORTAL_SOLO_NAME || DEFAULT_NAME,
    email: process.env.PORTAL_SOLO_EMAIL || DEFAULT_EMAIL,
  };
}

export const soloProvider: AuthProvider = {
  name: "solo",
  isStub: false,
  lockedReason: null,
  cookieName: "oi_portal_identity",

  // Single fixed consultant — always signed in, cookie irrelevant.
  getIdentity() {
    return soloIdentity();
  },

  selectableIdentities() {
    return [];
  },

  makeSessionCookie() {
    return null;
  },
};
