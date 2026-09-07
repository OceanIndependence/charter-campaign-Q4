/**
 * Consultant identity and the auth-provider seam — SERVER-ONLY.
 *
 * Ownership across the portal is keyed on a ConsultantIdentity, which every
 * provider (the dev stub now, Microsoft 365 later) produces the same way.
 * Swapping providers is implementing one module and setting env vars; no
 * route, storage or ownership-check code changes.
 */

export interface ConsultantIdentity {
  /**
   * Durable owner key. For Microsoft this is the directory object ID (oid),
   * which is stable even if the person's email or name changes. For the stub
   * it is a fixed fake id. Ownership is always keyed on this.
   */
  id: string;
  /** Human-readable address (Microsoft: UPN / mail). Display + audit only. */
  email: string;
  /** Display name. Cosmetic. */
  name: string;
}

/**
 * A provider reads the current identity out of the request's cookies and,
 * for interactive sign-in, describes how to begin. The HTTP mechanics live
 * in the routes; the provider supplies the primitives.
 */
export interface AuthProvider {
  /** Short id for diagnostics, e.g. "stub", "microsoft", "locked". */
  readonly name: string;
  /** True only for the development stub — surfaced in the UI and /api/health. */
  readonly isStub: boolean;
  /** When set, the provider is inert and every request is denied (fail closed). */
  readonly lockedReason: string | null;
  /** The cookie the identity session is stored in. */
  readonly cookieName: string;

  /** Resolve the identity from a cookie value, or null if absent/invalid. */
  getIdentity(cookieValue: string | undefined): ConsultantIdentity | null;

  /**
   * Identities a user may pick from at sign-in. The stub returns its fakes;
   * real providers return [] and use a redirect flow instead.
   */
  selectableIdentities(): ConsultantIdentity[];

  /**
   * Build the session cookie for a chosen identity id (stub sign-in). Returns
   * null when the provider does not support direct selection (e.g. Microsoft,
   * which mints the cookie only after validating a real token).
   */
  makeSessionCookie(id: string): { name: string; value: string } | null;
}
