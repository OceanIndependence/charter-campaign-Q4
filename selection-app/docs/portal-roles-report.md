# Portal roles: owner plus a per-consultant admin flag

Admin access used to come from `PORTAL_ADMIN_EMAILS` alone: any address in
that comma-separated list saw the admin view, and adding or removing an
admin meant editing an environment variable and redeploying. This change
replaces it with one owner in the environment and a per-consultant flag the
owner ticks on the existing `/admin` consultants screen.

`PORTAL_ADMIN_EMAILS` is still read, as a deliberate fallback, and is not
removed in this change. The steps to retire it are at the end.

## The role model

- `PORTAL_OWNER_EMAIL` holds exactly one address: the owner.
- The consultant record gains three fields: `isAdmin` (boolean, default
  false), `adminGrantedBy` (email) and `adminGrantedAt` (ISO timestamp).
  They are admin-controlled, in the same category as display name, job
  title and email — never self-editable by the consultant.

Roles resolve to `owner`, `admin` or `consultant`.

## Where the resolution function lives

`selection-app/src/server/auth/role.ts` — `resolvePortalRole(identity)`.
It is the only place a role is decided, and it runs on every request rather
than being cached in the session, so ticking someone as admin takes effect
at their next request, including the first sign-in of a consultant who has
never signed in before.

Order:

1. The session email matches `PORTAL_OWNER_EMAIL`, compared trimmed and
   lowercase, returns `owner` **before any storage read**. The owner
   therefore needs no consultant record and never appears in the
   consultants list because of this check. A blank variable never matches a
   blank email.
2. Otherwise the consultant record is looked up by email. It returns
   `admin` only when `isAdmin` is true AND the record is active. An
   inactive record never resolves to admin, whatever the flag says, so
   retiring someone removes their admin access with it.
3. Otherwise `consultant`.

Between steps 2 and 3 sits the temporary `PORTAL_ADMIN_EMAILS` fallback
described below.

`roleIsAdmin(role)` (owner or admin) is what the guards compare against, so
the owner/admin distinction lives in one place too.

## Which routes and pages call it

Every admin-only API route authorises server-side on each request through
`requireAdminSession()` in `selection-app/src/server/auth/index.ts`, which
calls `resolvePortalRole()`. Hiding navigation is not relied on anywhere.

| Route | Guard |
| --- | --- |
| `GET`/`POST /api/admin/consultants` | `requireAdminSession` |
| `PUT /api/admin/consultants/[id]` | `requireAdminSession` |
| **`PUT /api/admin/consultants/[id]/admin`** (new) | **`requireOwnerSession`** |
| `POST /api/admin/import-consultants` | `requireAdminSession` |
| `POST /api/admin/attach-fixture` | `requireAdminSession` |
| `POST /api/admin/assign-selection` | `requireAdminSession` |
| `POST /api/admin/detach-consultants` | `requireAdminSession` |

The four operator routes beside them (`sirv-readdir`,
`rebuild-in-use-index`, `backfill-facts`, `backfill-sirv`) take the
`CRON_SECRET` bearer and are outside the role model, unchanged.

`/api/selections` and its children are not admin-only, but admin status
widens what they return; they get it from the session object, which now
carries the resolved role.

Pages: `/portal/admin/consultants` and `/portal/admin/import-consultants`
use the new `getAdminPageState()`, and the ordinary portal pages use
`getPortalPageState()`, both of which resolve the role the same way.

Only the owner may change `isAdmin`, enforced by `requireOwnerSession()` on
the server. An admin can see who is an admin and cannot grant or revoke it;
the read-only column in the UI is a courtesy, not the guard.

## Writes

`PUT /api/admin/consultants/[id]/admin` reads that one consultant record,
sets `isAdmin`, `adminGrantedBy` (the owner's address) and `adminGrantedAt`,
and writes that single record back through the existing
`writeConsultantRecord()`. The consultant collection is never rewritten:
Blob is last-write-wins and rewriting the list would drop a concurrent edit
to another row. On revoke, `adminGrantedBy` and `adminGrantedAt` are
cleared.

Two writes are refused by the server:

- toggling a record that carries the owner's address — owner access comes
  from the environment and there must be no request that can remove it;
- granting admin to an inactive record, which would be a tick that does
  nothing, since step 2 above ignores it. Revoking is always allowed.

## UI

`selection-app/src/components/portal/ConsultantAdmin.tsx` gains an ADMIN
column between STATUS and SOURCE:

- the owner's own row, if one exists, shows a fixed OWNER chip and no
  control at all;
- for the owner, every other row has a checkbox that writes immediately —
  optimistic, with the row reverted and an inline error shown under the
  checkbox on failure;
- for an admin, the column is a read-only ADMIN badge on admin rows and
  nothing on the others.

It is a column, not a field in the edit drawer, so all rows read at a
glance. The chip and badge reuse the existing `ssoTag` and
`status`/`status_published` styling already used by NOT YET SIGNED IN and
ACTIVE. The summary counts line above the table now reads
`22 OF 22 · 1 INACTIVE · 3 ADMIN · … ` in the existing format.

## Files changed

| File | Change |
| --- | --- |
| `src/server/auth/role.ts` | **New.** `resolvePortalRole()`, `ownerEmail()`, `isOwnerEmail()`, `roleIsAdmin()`, and the temporary fallback |
| `src/server/auth/index.ts` | `isAdmin()` env check removed; sessions carry `role`; `requireAdminSession` no longer creates a record; `requireOwnerSession` and `getAdminPageState` added; `adminListConfigured` → `adminAccessConfigured` |
| `src/lib/consultant-types.ts` | `isAdmin`, `adminGrantedBy`, `adminGrantedAt` on `ConsultantRecord`; `PortalRole` type |
| `src/server/consultants.mjs` | The three fields in `emptyConsultantRecord()` and `normaliseRecord()` |
| `src/app/api/admin/consultants/[id]/admin/route.ts` | **New.** The owner-only toggle |
| `src/app/api/admin/consultants/route.ts` | `GET` also returns `role` and `ownerEmail` |
| `src/app/api/admin/consultants/[id]/route.ts` | Comment only: the three admin fields are never accepted here |
| `src/app/portal/admin/consultants/page.tsx` | `getAdminPageState()`; header tolerates an owner with no record |
| `src/app/portal/admin/import-consultants/page.tsx` | Same, and the "not an admin" copy now describes the role model |
| `src/components/portal/ConsultantAdmin.tsx` | The ADMIN column, the toggle, the admin count |
| `README.md` | The roles section |

Records written before this change have none of the three fields;
`normaliseRecord()` reads them back as `isAdmin: false`, so no migration
pass over stored records is needed.

## Removing PORTAL_ADMIN_EMAILS

While the fallback is in place, an address in `PORTAL_ADMIN_EMAILS`
resolves to `admin` even when `isAdmin` is false, and every such grant logs
at info level:

```
[role] someone@ocyachts.com was granted admin by PORTAL_ADMIN_EMAILS, not by
their record (isAdmin=false). Tick this person on /portal/admin/consultants
so the variable can be removed.
```

The record path does not log, so a quiet log means nobody depends on the
variable any more. To remove it safely:

1. Set `PORTAL_OWNER_EMAIL` in Vercel to the one owner address and
   redeploy. Confirm you see the checkboxes on `/portal/admin/consultants`.
2. Tick every person who should keep admin access. The ADMIN count in the
   summary line is the quick check.
3. Compare that count against `PORTAL_ADMIN_EMAILS`. Anyone on the variable
   who should not keep access simply stays unticked.
4. Watch the deployment logs for `[role] … granted admin by
   PORTAL_ADMIN_EMAILS` for a few days of normal use. Each line names an
   address still relying on the variable — tick that person, or decide they
   should lose access.
5. Once no such line has appeared for a full working week, remove the
   fallback in code: delete `legacyAdminList()`, `legacyAdminListConfigured()`,
   `resolveFromLegacyList()` and its call in step 3 of
   `resolvePortalRole()` in `src/server/auth/role.ts`, and simplify
   `adminAccessConfigured()` in `src/server/auth/index.ts` to
   `Boolean(ownerEmail())`.
6. Deploy that, confirm the admin screen still opens for the owner and for
   one ticked admin, then delete `PORTAL_ADMIN_EMAILS` from the Vercel
   environment.

Doing step 6 before step 5 is safe but pointless; doing step 5 before step
2 would lock out anyone not yet ticked.

## One thing to know

Under `PORTAL_AUTH_PROVIDER=microsoft`, the sign-in callback already
refuses anyone with no consultant record, before any of this runs. So on a
Microsoft deployment the owner does need a record in order to sign in at
all — not because of the role model, which never asks for one, but because
of that separate sign-in gate. Under `solo` and `stub` the owner needs no
record anywhere. If the owner should be able to sign in to a Microsoft
deployment without appearing in the consultants list, that callback gate is
the thing to change, and it was left alone here deliberately.
