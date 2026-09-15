# Phase 3 — consultant details on client pages

What was built, what was verified locally, what could not be, and how to see
it on a preview.

## Attaching a consultant to a selection

- `consultantId` on the selection is chosen once, at creation, from a picker
  on the dashboard's NEW SELECTION form: a dropdown of active consultant
  records showing display name and job title, sorted by display name. The
  format cards stay disabled until a consultant is chosen. Under the solo or
  stub provider the picker pre-selects the session's own record when it is
  in the list; the TODO in `Dashboard.tsx` and `api/selections/route.ts`
  notes that real sign-in pre-fills the same way, and the picker stays
  because a consultant may create a selection on a colleague's behalf.
- The edit form never shows the picker. Its YOUR DETAILS card is read-only
  and fed from the selection's consultant, returned alongside the draft by
  `GET /api/selections/:id`.
- Server-side, a save body carrying a different `consultantId` is refused
  with 403 ("A selection cannot be moved to another consultant"); creation
  without a consultant, or with an inactive one, is refused with 400. There
  is no reassignment path for anyone, admins included.
- Storage is now namespaced by consultant: `portal/selections/<consultantId>/<id>.json`
  and `portal/index/<consultantId>.json` (`src/server/pages.mjs`). `owner`
  is still stamped from the signed-in identity, for audit only.

## The Eleanor Bartoli Turner fixture

- Added as a row in `data/consultants-seed.csv` (regenerated into
  `src/data/consultants-seed.ts`), so she is created by the same import as
  everyone else: `source: "csv"`, `status: "active"`, phone and WhatsApp
  `+44 7000 000000`. Her photo `eleanor-bartoli-turner.jpg` IS in Team
  Images (HEAD 200, image/jpeg), so `photoStatus` is `ok` and the block
  renders with a photo.
- The backfill is the third card on `/portal/admin/import-consultants`,
  ATTACH ALL SELECTIONS TO ELEANOR. It creates her record from the seed row
  if missing (same import function), then moves every stored selection into
  her namespace, rewrites its dashboard row, deletes the old copy and stamps
  `consultantId` on its published `current.json`. It reports found, attached,
  already attached and published pages updated. A second press changes
  nothing. Same guard as the import: `PORTAL_ACCESS_KEY`, failing closed.
- It is a fixture, not a fallback: there is no default consultant anywhere.
  A selection without one cannot be published (422).

## Dashboard scoping

- The dashboard reads only the session consultant's index. `getSelection`
  reads only from the session consultant's namespace, so a shared URL to
  another consultant's selection is a 404 on view, edit, save, publish,
  unpublish, versions, rollback and delete alike. Every route goes through
  `selectionAccess(session)` from the auth module; none assembles access by
  hand.
- ALL CONSULTANTS (`PORTAL_MANAGERS`) still lists everyone's rows, but OPEN
  appears only on rows whose `consultantId` is the session's.

What was verified, with the stub provider and its three fake identities:
one identity created a selection for a colleague via the picker and then
could not read or publish it (404); a second identity saw only its own row
and got 404 on the first's selection; a PUT that changed `consultantId` was
refused. What could NOT be verified: the same behaviour under the solo
provider on a deployment, because every visitor there is one identity and
therefore one consultant record. The code path is identical; only the
number of distinct sessions differs.

## Rendering

- Unchanged from the earlier build and re-verified: the block resolves the
  record live on every render of `/selection/<slug>` and `/atlas/<slug>`
  and on the portal preview; a phone number changed on the profile page
  appeared on an already-published page without republish.
- Email is `mailto:`, phone is `tel:` with the digits and leading plus
  only, WhatsApp is `https://wa.me/<digits>` opening in a new tab. Digits
  are taken from the stored number with every space, plus and punctuation
  stripped and an international `00` prefix dropped. One addition beyond
  the brief: a bracketed trunk zero, as in `+44 (0)7000 …`, is removed
  rather than kept as a digit, because keeping it produces a wrong wa.me
  number. Recommend numbers are stored in international form without `(0)`.
- Photo omitted when `photoStatus` is `missing`; no placeholder on a client
  page. The photo is now `alt=""`: the name is the text beside it, and a
  photo that fails to load (CDN outage) leaves nothing behind rather than
  clipped alt text inside the circle, which is what the headless screenshot
  showed before the change.
- Inactive consultant: no block, no signatures, no "ask" button, no
  CURATED FOR YOU BY line, no name in the cover subline. Verified on both
  tiers: the block section is absent from the HTML and no consultant text
  remains in a production build.
- Contrast: the phone and mail icons now take the text colour
  (`currentColor`) instead of mint at 70 percent, which was below 3:1 on
  the light theme. The EXPLORE link's hover colour is the full foreground
  on both themes; it was mint on dark. Mint is no longer used for any text
  or icon in the block. Body rows are `--fg-7` (about 9:1 on dark, ink on
  light); the job title is `--fg-5` (about 5:1 on dark, `#555759` on
  light, 7:1); the EXPLORE link is `--fg-45` (about 4.6:1 on dark).
- Publish is blocked while the selection's consultant is active with no
  phone, naming them; the link to the profile is offered only when it is
  the session consultant's own record.

## Narrow viewport

Checked at 375 × 812 with the block cropped from both tiers. The photo wraps
above the text, which is now centred under 480 px, with the two contact rows
and the WHATSAPP ME button centred beneath. Names and emails can break
anywhere rather than force a wide column.

Things I expect to cause trouble on a real page:

- Long names in letter-spaced capitals. NURIA SAPERAS CASANOVAS at 14 px
  with 0.3 em tracking is about 290 px, which fits 375 px with 24 px
  gutters but not much less. It will wrap to two lines on the smallest
  phones, which reads acceptably, but a name one word longer would break
  mid-word.
- Long job titles. GROUP DIRECTOR & SENIOR CHARTER CONSULTANT wraps to two
  lines at this width. Fine, but the tracking makes it look wide.
- The EXPLORE ALL 2027 DESTINATIONS link sits inside the block, so an
  inactive consultant removes it too. If that link matters independently of
  the consultant it should move out of the block.
- The photo is 128 px on every width. On a 320 px phone it dominates the
  block; 96 px under 480 px would sit better. Left as is to keep the
  existing scale.
- The `tel:` link is live on desktop too, where it opens whatever handles
  the scheme, often nothing. That is normal for client pages but worth
  knowing.

## Seeing it on a preview

I cannot reach the Vercel deployment or its Blob store from this session,
so I cannot give you finished URLs. The paths and the steps to produce them:

1. Set `PORTAL_SOLO_EMAIL=eleanor@ocyachts.com` (and `PORTAL_SOLO_NAME=Eleanor Bartoli Turner`)
   for the environment you are testing, and redeploy. Under the solo
   provider the session consultant is resolved by that email; without it the
   visitor gets an unrelated record and, after the backfill, an empty
   dashboard, since every existing selection now belongs to Eleanor.
2. Sign in at `/portal/login`, open `/portal/admin/import-consultants`,
   press IMPORT SEED LIST (creates Eleanor, skips the 20), then ATTACH ALL
   SELECTIONS TO ELEANOR.
3. Tier 3 with a consultant: any already-published Yacht Selection. The
   dashboard's MORE → Live page link goes to `/selection/<slug>`; the block
   now shows Eleanor with her photo.
4. Tier 2 with a consultant: any already-published Personalised Atlas at
   `/atlas/<slug>`. If none was published, create one from the dashboard
   (picker: Eleanor), add two yachts and three destinations, publish.
5. Inactive: on `/portal/admin/consultants` (needs your address in
   `PORTAL_ADMIN_EMAILS`, matched against `PORTAL_SOLO_EMAIL`), set a
   consultant inactive and reload one of their pages. Doing this to Eleanor
   removes the block from every test page; doing it to a second consultant
   you first pick for a new selection keeps the fixtures intact.

## Addendum — scoping switched off behind a flag

Deploying the consultant-scoped storage to Production, where the solo
provider had no `PORTAL_SOLO_EMAIL`, resolved every visitor to a fresh
record whose index was empty, so every existing selection disappeared from
the dashboard. Visibility is restored by a feature flag, not a patch to the
filter:

- `CONSULTANT_SCOPING` — unset or anything but `on`/`true`/`1`/`yes` means
  OFF, the default. While off: the dashboard lists every index for every
  signed-in user (the ALL CONSULTANTS toggle is hidden because there is no
  "mine"); view, edit, save, publish, unpublish, versions, rollback and
  delete find a selection by id wherever it lives, with no ownership check;
  a selection with no `consultantId` publishes with the block frozen in its
  draft, as before consultant records existed.
- Selections are located by id through `portal/selection-locations.json`
  (`{ id: namespace }`), written on every save and self-healing: an id it
  does not know costs one scan of `portal/selections/` and is then
  recorded. Saves go back to the namespace the selection was read from, so
  nothing moves.
- The profile gate (redirect to `/portal/profile` while the session
  consultant has no phone) is behind the same flag, since under the solo
  provider the session record is a stand-in with no phone and the redirect
  fired on every visit. Publishing a selection whose consultant has no phone
  is still refused.
- The scoping code is intact and verified with the flag on: the dashboard
  returns only the session consultant's rows, and another consultant's
  selection is a 404 on every route.
- The Eleanor attachment is undone by the third card on
  `/portal/admin/import-consultants`, CLEAR CONSULTANT FROM ALL SELECTIONS:
  every selection loses its `consultantId` and every published page its
  stamp, so pages fall back to their frozen block. Records are untouched.
  The attach action stays in the code without a button.
- To confirm what is in the Production store: press CLEAR and read
  SELECTIONS IN STORE, which is the count of every selection document under
  `portal/selections/`; the dashboard's counter (`N OF N`) must then show
  the same number, and every row opens. I cannot reach the store from this
  session, so those two numbers are the confirmation.

## Files

- `src/server/pages.mjs` — consultant-namespaced storage and access.
- `src/server/auth/index.ts` — `selectionAccess()`.
- `src/server/consultant-fixture.mjs`, `src/app/api/admin/attach-fixture/route.ts` — the backfill.
- `src/app/api/consultants/route.ts` — the picker list.
- `src/components/portal/Dashboard.tsx` — the creation form with the picker.
- `src/components/portal/ConsultantDetailsCard.tsx` — read-only card from the selection's consultant.
- `src/components/ConsultantBlock.tsx`, `ConsultantBlock.module.css`, `src/components/icons.tsx`, `src/lib/format.ts` — rendering, contrast, mobile, wa.me.
