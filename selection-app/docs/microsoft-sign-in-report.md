# Microsoft sign-in

Branch `microsoft-sign-in`, from `main`. What was built, what changed from
the previous sign-in, what was verified and how, and what is still open.

## What was built

**The provider** — `src/server/auth/microsoft.ts`. OpenID Connect
authorization-code flow with PKCE against the Ocean Independence tenant,
on Node's `crypto` and `fetch`, no auth library:

- `GET /api/auth/microsoft` sets a ten-minute flow cookie (state, nonce,
  PKCE verifier, return path, HMAC-signed) and redirects to Microsoft. The
  redirect URI is always the one registered origin (see **One origin**
  below), never the host the browser happened to use.
- `GET /api/auth/microsoft/callback` checks the state against the flow
  cookie, exchanges the code with the client secret and the PKCE verifier,
  and validates the ID token: RS256 signature against the tenant's
  published keys (re-fetched once on an unknown key id, so key rollover
  does not lock people out), issuer, audience, tenant, expiry, nonce.
- Job title is read from Microsoft Graph `/me` with the `User.Read` scope,
  best effort; blank if the call fails.
- The session cookie `oi_portal_identity` holds `{ oid, email, name,
  jobTitle, iat, exp }` signed with `PORTAL_SESSION_SECRET`, seven days.
  Every request verifies the signature and expiry; a forged or expired
  cookie is simply "not signed in".
- Sign-out (`DELETE /api/auth/identity`) clears the cookie. It does not end
  the Microsoft session in the browser, so signing in again is one click.

**One origin.** Entra matches redirect URIs exactly and accepts no
wildcards, while Vercel gives every deployment its own host
(`charter-campaign-q4-<hash>-<team>.vercel.app`). Signing in from one of
those sent Entra an unregistered URI and failed with AADSTS50011. The flow
is now pinned to a single origin, resolved in `src/server/auth/origin.ts`:
`PORTAL_PUBLIC_ORIGIN` if set, else Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`
(the production domain, the same value on every deployment), else the
request's origin for local development. A browser that starts the flow on
any other host is redirected to that origin first, before the flow cookie
is set, so both legs agree on the redirect URI and share the cookie. Only
`https://charter-campaign-q4.vercel.app/api/auth/microsoft/callback` has to
be registered.

**Who may sign in.** Only people with a consultant record. After the token
is validated the callback looks the person up by object ID, then by sign-in
address among active records. No record: back to the sign-in screen with
"This Microsoft account has no consultant profile in the Charter Portal.
Contact marketing to be added." and no cookie. The record is claimed
(object ID written in) on the first portal request by the existing
resolution in `consultant-session.ts`; under Microsoft that resolution
never creates a record from claims.

**The screen** — `src/components/portal/MicrosoftSignIn.tsx`. The same
layout as the QR business card tool: wordmark, RETAIL CHARTER CAMPAIGN Q4,
one outlined CONTINUE WITH MICROSOFT button with the four-square mark, and
the two lines on who may enter. Errors from the callback appear under the
button in plain words.

**Scoping and the profile gate are on.** `CONSULTANT_SCOPING` and the
profile redirect now default to on whenever `PORTAL_AUTH_PROVIDER=microsoft`
and off otherwise; an explicit `on`/`off` still wins. A consultant's
dashboard lists only their own selections and every route (view, edit,
save, publish, unpublish, versions, delete) reads only from their
namespace.

**Admin.** An identity whose email is in `PORTAL_ADMIN_EMAILS` sees every
selection, gets a CONSULTANT column (owner's display name, or Unassigned)
and a consultant filter on the dashboard, and can open, edit, publish and
unpublish any of them: `selectionAccess()` carries `isAdmin`, and the
storage layer locates a selection by id for admins instead of by the
session namespace. The import, clear-assignments and attach routes are
now behind the same admin check.

## What changed from the previous sign-in

| | Before (solo provider) | Now (Microsoft) |
| --- | --- | --- |
| Front door | `PORTAL_ACCESS_KEY` typed at `/portal/login` | Microsoft account in the tenant; `/portal/login` redirects to the Microsoft screen and the key is not asked for |
| Identity | One fixed person for every visitor (`PORTAL_SOLO_*`) | The signed-in person: object ID, email, name, job title from the token |
| Consultant record | Resolved by `PORTAL_SOLO_EMAIL`; created if missing | Matched by object ID then email; sign-in refused if none |
| Dashboard | Everyone saw everything (flag off) | Own selections only; admins see all with a CONSULTANT column |
| Ownership checks | None | Structural: another consultant's selection is a 404 |
| Profile gate | Off | On: no phone number, redirected to the profile until entered |
| Admin pages guard | `PORTAL_ACCESS_KEY` | `PORTAL_ADMIN_EMAILS`, the import page included |
| Existing selections (no consultant) | Visible to all | Visible to admins only |

The stub (development) and solo providers are unchanged and still behind
the access key; `PORTAL_AUTH_PROVIDER` selects between them. Nothing was
removed.

## Verified

Against a local mock of the Microsoft authority and Graph (`scratchpad`,
not committed) that issues RS256 ID tokens from a fresh key, enforces PKCE
and the client secret, and serves `/me`:

- No access key asked for; `/portal/login` and `/portal` both land on the
  Microsoft screen, which renders the wordmark, tool name, button and note.
- A tenant account with no record is refused with `?error=no-record` and no
  session cookie, before and after the seed import.
- A seeded consultant signs in, her record is claimed (object ID written,
  `source: csv`, job title from Graph), she lands on `/portal`, creates a
  selection and sees only her rows; another consultant's selection is 404.
- The admin signs in, sees every row with the consultant's name, and opens,
  saves and loads the edit page of another consultant's selection; the
  import status route answers 200 for the admin and 403 for a consultant.
- A forged session cookie and a replayed callback are both rejected;
  sign-out clears the session.
- `tsc` and `next build` clean.

Not verified: the real tenant. I cannot sign in to Microsoft from this
session, so the first real sign-in on Production is the test of the app
registration itself (redirect URI, secret, tenant restrictions).

## Environment variables

Already set by you: `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`,
`AZURE_AD_CLIENT_SECRET`, `PORTAL_ADMIN_EMAILS`.

Still needed before switching:

```
PORTAL_SESSION_SECRET=<long random string, 32+ characters>
PORTAL_AUTH_PROVIDER=microsoft
```

`PORTAL_PUBLIC_ORIGIN` is optional and only needed for a custom domain;
without it the Vercel production domain is used. Set the two above for
Production, redeploy. With
`microsoft` selected and any variable missing the portal is locked, not
open. `PORTAL_ACCESS_KEY` and the `PORTAL_SOLO_*` variables can stay or go;
they are ignored under Microsoft.

## PORTAL_ACCESS_KEY

Under Microsoft the key is ignored: the tenant is the front door and
`/portal/login` redirects to the Microsoft screen. It is still the gate for
the stub and solo providers, so it is what closes a Preview deployment to
anyone holding the URL.

The consultant import page was the last thing still reading it, and under
Microsoft that left it unreachable for the very admin its own API already
admitted: with the key unset the page declared itself closed, and with the
key set it redirected to a login that Microsoft redirects away from. It now
guards on `PORTAL_ADMIN_EMAILS`, like the consultant admin screen and both
admin APIs. On Preview, where everyone is Eleanor, add her address to
`PORTAL_ADMIN_EMAILS` for that environment if you want the import button
there.

## Preview: always signed in as Eleanor

Microsoft sign-in is Production only. Preview keeps the single-consultant
provider, which admits every visitor as one fixed real person. On the
Preview environment set:

```
PORTAL_AUTH_PROVIDER=solo
PORTAL_SOLO_EMAIL=eleanor@ocyachts.com
PORTAL_SOLO_JOB_TITLE=Charter Consultant
```

The name already defaults to Eleanor Bartoli Turner; the address is what
matters, because the record is matched on it. Leaving `PORTAL_SOLO_EMAIL`
unset is what produced the earlier stray profile with no phone number: an
empty address matches nothing, so a fresh blank record is minted instead of
her real one. Leave `PORTAL_ACCESS_KEY` unset on Preview to skip the key
prompt, and `CONSULTANT_SCOPING` unset so she still sees every selection
(set it to `on` to preview the scoped dashboard).

Verified locally against the seeded directory: `/portal` opens straight to
the dashboard with no sign-in screen and no key, `/portal/sign-in`
redirects to it, and the identity resolves to her imported record,
`eleanor@ocyachts.com`, active, with her phone number.

## Outstanding questions and issues

1. **Your own record.** Sign-in is refused without a consultant record,
   and the admin email is not in the seed list. Before switching, add
   yourself on `/portal/admin/consultants` (ADD CONSULTANT, with the address
   Microsoft signs you in as) while still on the solo provider, or you will
   be locked out with everyone else. The same applies to anyone else who
   needs access but is not a consultant.
2. **Redirect URI.** One entry covers every deployment now that the flow is
   pinned to one origin:
   `https://charter-campaign-q4.vercel.app/api/auth/microsoft/callback`,
   already registered. Opening the portal on a deployment-specific URL
   sends you to that host to sign in, which is intended. A custom domain
   later needs its own entry plus `PORTAL_PUBLIC_ORIGIN` set to it.
   Microsoft sign-in is Production only by your decision, so no preview
   host needs registering.
3. **Existing test selections.** They have no consultant, so under scoping
   only you see them. You said that is fine. If a consultant later needs
   one, the clean route is to duplicate it from your admin view (the copy
   takes the consultant you pick) rather than reassign.
4. **Client secret expiry.** Entra secrets expire (six to twenty-four
   months). When it does, every sign-in fails with "Token exchange failed
   (invalid_client)". Note the date and rotate the variable before then.
5. **Sign-out scope.** Signing out clears the portal cookie only. On a
   shared machine the Microsoft session persists and CONTINUE WITH
   MICROSOFT signs straight back in. If that matters, a redirect to
   Microsoft's end-session endpoint can be added.
6. **Job title.** Read once at sign-in and used only when a record is first
   created from claims, which under Microsoft never happens (no record, no
   entry). It is therefore informational only; seeded titles stand.
7. **Development stub.** Still available with `PORTAL_AUTH_PROVIDER=stub`
   in non-production builds, unchanged, for local testing without a tenant.
