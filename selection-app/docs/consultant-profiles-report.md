# Consultant profiles on client pages

What the contact block at the foot of a published Tier 2 (`/atlas/<slug>`) or
Tier 3 (`/selection/<slug>`) page shows, depending on the consultant record
behind it. Written at the end of Phase 3 and extended in Phase 4 with the
admin screen and the admin-created record.

## How the block is resolved

- A selection carries the consultant's record id (`consultantId`), stamped
  server-side when it is created and copied onto the published record at
  `portal/pages/<slug>/current.json`. Nothing in the request body can set it.
- Every render of a client page reads the record behind that id
  (`src/server/consultant-render.ts`) and builds the block from the record as
  it stands now. This is deliberately different from the specifications,
  which are frozen at publish: a phone number corrected on the profile page
  propagates to every page already published, with no republish.
- The block frozen into `config.consultant` at publish is the record as it
  stood at that moment. It is only rendered by the holding page, when
  storage cannot be read, and by pages that predate consultant records.
- The portal preview resolves the block the same way, so a consultant sees
  exactly what the client will.
- Publishing is refused while the assigned consultant is active and has no
  phone number, with a message naming them and a link to their profile.

## A seeded consultant

Record created by the one-off import from `data/consultants-seed.csv`
(`source: "csv"`), claimed at first sign-in by email.

The client page shows, in the existing type scale and spacing of the block:

- the team photo from `cdn.oceanindependence.com/Team Images/`, as a
  128 px circle, because the import's HEAD check set `photoStatus: "ok"`
  (all 20 seeded photos resolved);
- the display name in capitals and the job title beneath it;
- the phone number as a `tel:` link and the email as a `mailto:` link;
- a WHATSAPP ME button, since every seeded row has a WhatsApp number.

If the consultant later blanks their WhatsApp number on the profile page,
the button disappears from every published page on the next load.

## An unseeded consultant

Someone who signs in without a seed row. The record is created from the
token claims (`source: "sso"`): display name and job title from the claims,
email from the token, and a photo URL derived from the display name
(`barbara-muller`, `daphne-doffay` style slug under the same CDN folder) and
HEAD-checked.

- Where the derived photo resolves, the page shows it exactly as for a
  seeded consultant.
- Where it does not (the common case for a name marketing has not
  photographed under that slug), `photoStatus` is `missing` and the page
  omits the image: the text block stands alone, centred, with no placeholder
  on the client page. The consultant sees a neutral placeholder and the
  contact-marketing line on their profile page instead.
- Job title is whatever the claims carried; with the current stub it is the
  stub's title, and with Microsoft it will be blank unless the provider
  supplies one. A blank title hides that line.
- Phone is empty at creation, so the dashboard sends the consultant to the
  profile page first and publishing is blocked until a number is saved.
- The dashboard flags these records with a CREATED AT SIGN-IN tag when
  viewing all consultants, and shows the consultant themself a note.

## An admin-created consultant not yet claimed by a sign-in

An admin has added someone from `/portal/admin/consultants` with a display
name, job title and email (`source: "admin"`, `objectId: null`). Until that
person signs in:

- No client page can show them, because no selection can be attached to
  them: a selection takes the record of the consultant who creates it, and
  they have not signed in to create one. The record exists only so the
  first sign-in lands on marketing's spelling of the name and title rather
  than the token's.
- Photo is blank (`photoStatus: "missing"`) until the admin sets a URL on
  the edit form, where it is HEAD-checked on save and shown inline, so a
  wrong URL is caught there rather than on a client page.
- Phone and WhatsApp are blank and cannot be entered by the admin.

On that person's first sign-in the email match claims the record: the
object ID is written in, the display name and title are kept as the admin
entered them (claims never overwrite), and the dashboard sends them to the
profile page for a phone number. From then on their pages behave as for a
seeded consultant. The admin list shows NOT YET SIGNED IN against every
record without an object ID, seeded or admin-created.

## A seeded address that is not the sign-in address

If the seed list carries an address Microsoft does not sign the person in
as, their first sign-in finds no active record by email and creates a stray
`source: "sso"` record. The admin reconciles the two from the list:

1. Set the stray record inactive. Its details leave every client page at
   once (charter desk instead), and its numbers become read-only.
2. Correct the seeded record's email to the sign-in address, ticking
   "release for re-claiming" if the seeded record had been claimed by the
   wrong sign-in. This is allowed while the stray holds the same address
   because uniqueness of email and object ID is enforced among active
   records only.
3. On the consultant's next request, the lookup prefers an active record:
   the inactive stray no longer wins on object ID, the seeded record is
   claimed by email, and the object ID is cleared from the stray. Both
   records keep their `updatedBy` stamps, so the reconciliation is visible.

Reactivating the stray while the seeded record holds the address is refused.

## An inactive consultant

An admin has set `status: "inactive"` on `/portal/admin/consultants`.

- The consultant's details are suppressed entirely: no name, title, photo,
  number or address of theirs appears on any page, published before or
  after the change.
- The block shows the generic charter desk contact instead, held in one
  place: `src/lib/charter-desk.ts`, overridable with the `CHARTER_DESK_NAME`,
  `CHARTER_DESK_TITLE`, `CHARTER_DESK_EMAIL`, `CHARTER_DESK_PHONE` and
  `CHARTER_DESK_WHATSAPP` environment variables.
- The desk's email and phone are deliberately blank in the code until
  marketing confirms them, so today the fallback block reads OCEAN
  INDEPENDENCE / Charter Desk with no contact rows. Set the two variables
  before any consultant is marked inactive.
- The consultant's own phone and WhatsApp become read-only everywhere: the
  profile page renders them as text, and the API refuses changes.
- Publishing a selection assigned to an inactive consultant is not blocked
  on their phone number, since the page will not show it.
- The consultant still signs in to their own inactive record (an inactive
  object-ID match is the fallback when no active record matches their
  email), sees it read-only on the profile page, and is not sent a new
  stray record.
- Admin access is decided by `PORTAL_ADMIN_EMAILS` alone, so an admin who
  marks themself inactive keeps the admin screen.

## Pages published before consultant records existed

Their published record has no `consultantId`, so they keep the block frozen
at publish (the hand-typed details of the time). They were test pages and
are left as they are. The Harrington demo page behaves the same way. A
selection created before records existed is attached to the publishing
consultant's record on its next save or publish, and from then on renders
live.

## What the forms show

The "YOUR DETAILS" section of both forms is now a read-only card fed from
the consultant's record, with an EDIT YOUR NUMBERS link to the profile page
and the contact-marketing line. Nothing about the consultant is typed into
a selection any more.

## What admins can and cannot do

`/portal/admin/consultants`, guarded server-side by `PORTAL_ADMIN_EMAILS`
(the page redirects and the API answers 403 for anyone else), lists every
record with display name, job title, email, status, source, photo status and
the last change with who made it, flagging CREATED AT SIGN-IN and NOT YET
SIGNED IN. From a row an admin edits display name, job title, email and
photo URL, sets active or inactive, and releases the sign-in link. There is
no delete. Phone and WhatsApp are neither shown nor accepted by the admin
API, including for the admin's own record. Every change writes `updatedAt`
and `updatedBy` as `admin:<email>`; there is no audit log beyond this.

## Verified locally

Against the filesystem store with the stub identities: publish refused
without a phone (422, with the profile link); published with one; the page
followed a phone correction without republish; the preview matched; the
inactive record gave way to the charter desk; the demo page kept its frozen
block. Phase 4: a non-admin got 403 from the API and a redirect from the
page; an admin added a record, was refused a duplicate address, could not
set a phone, saw a wrong photo URL come back "missing (HTTP 404)" and a
right one "ok"; the added record was claimed by the matching sign-in; the
stray-record reconciliation above completed on the next request; an
inactive consultant kept resolving to their own record. A production build (`next start`) of a client page contained none of
the record JSON, object id or draft id. In `next dev` only, Next's debug
payload embeds server-side props in the HTML, which is why a raw record is
visible in the dev page source but not in production.
