/**
 * Microsoft 365 (Entra ID) sign-in provider — SERVER-ONLY. PLACEHOLDER.
 *
 * This is the one module that gets implemented to go live. It must produce a
 * ConsultantIdentity whose `id` is the token's `oid` (object ID) claim,
 * `email` the `preferred_username`/`email`, and `name` the `name` claim, and
 * store a signed/validated session cookie. Nothing else in the app changes:
 * ownership is already keyed on ConsultantIdentity.id and drafts are already
 * namespaced by it.
 *
 * Expected environment (see index.ts / README for the full list):
 *   AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET,
 *   PORTAL_SESSION_SECRET, and the app's redirect URI.
 *
 * Until implemented, requesting this provider fails closed (see index.ts),
 * so a half-configured production deploy is locked, never open.
 */

import type { AuthProvider } from "./types";

export function microsoftProvider(): AuthProvider | null {
  const configured =
    process.env.AZURE_AD_TENANT_ID &&
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.PORTAL_SESSION_SECRET;
  if (!configured) return null; // selector will lock

  // TODO(auth): implement the OIDC auth-code flow against the OI tenant and
  // return a provider whose getIdentity() validates the session and yields
  // { id: oid, email, name }. Intentionally not stubbed with fake behaviour.
  throw new Error(
    "Microsoft sign-in is selected but not yet implemented — implement src/server/auth/microsoft.ts."
  );
}
