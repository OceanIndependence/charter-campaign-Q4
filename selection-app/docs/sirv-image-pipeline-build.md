# Sirv image pipeline, per-yacht records and cron redesign — build report

Built 11–14 September 2026 on branch `claude/sirv-image-pipeline` from
`origin/main` (`08ef4d4`). Six commits, one per phase, each pushed for a
Vercel preview. Nothing has been merged to `main`. All paths below are
relative to `selection-app/`. The audit this work builds on is
`docs/blob-operations-audit.md`.

Every phase was exercised locally against a mock Yachtfolio API and a mock
Sirv API with the filesystem store (`PORTAL_STORE_DIR`), including an
end-to-end run of the built app (`next start`) through the routes, a publish
and a rendered client page. Neither the real Yachtfolio passkey nor Sirv
credentials were available to the build session; see section 6 for what
that leaves to confirm on first deploy.

## 1. What changed, by phase

### Phase 1 — Sirv client and `IMAGE_STORE` switch (`a3e7931`)

- `src/server/image-store/sirv-client.mjs` — bearer token cached in module
  scope and refreshed a minute before Sirv's 20-minute expiry; `upload`,
  `remove`, `stat`, `readdir`; exponential back-off (2 s, 8 s) on 429 and
  5xx over three attempts; one token refresh on 401; per-process call
  counters (`sirvOps()`); `purge()` is a documented no-op (Sirv invalidates
  its CDN cache on overwrite; no REST purge exists). The secret never reaches
  a log line or an error message.
- `src/server/image-store/index.mjs` — `getImageStore()` returns `"sirv"`
  only when `IMAGE_STORE=sirv` and `SIRV_CLIENT_ID`, `SIRV_CLIENT_SECRET` and
  `SIRV_BASE_URL` are all present, otherwise `"blob"` with one warning per
  process; `sirvImageUrl(key, variant)` builds
  `${SIRV_BASE_URL}${key}?profile=<hero|thumb>` (no query for `original`).
- `src/app/api/health/route.ts` — adds `imageStore`, `imageStoreRequested`,
  `sirvConfigured`, `sirvRootPath`, `sirvBaseUrl`, `sirvProfiles` and
  `portalAccessKeyConfigured`.
- `src/server/storage.mjs` — `listImageFiles()` removed (dead since
  `f33d74f`); no `list()` against the IMAGES store remains anywhere.

### Phase 2 — Per-yacht records and the in-use index (`4b466e7`)

- `src/server/yacht-records.mjs` — one private record per yacht at
  `yachts/<yfId>.json`: `specs`, `specsHash`, `specsFetchedAt`,
  `yfLastModified` (the brochure's `last_modified`), `facts { builder,
  lengthM, basePort, fetchedAt }`, `images { status, startedAt, updatedAt,
  store, main, order[], failures[] }`, `lastCheckedAt`. `readYachtRecord()`
  returns `null` for a missing record and throws on any other storage error.
  Lazy migration builds a first record from the legacy manifest entry,
  `yachtfolio/details/<id>.json` and the facts in `fleet.json`, deleting
  none of them; legacy Blob images are carried into `order[]` with
  `store: "blob"` and their existing URLs. `startPreparing()` refuses a
  second claim under five minutes old and takes over an older one.
- `src/server/fleet.mjs` — `getYachtDetail()` and `getYachtImages()` read
  and write the record instead of the manifest and details files; a record
  is rewritten only when specifications, facts or image order change (or,
  for `lastCheckedAt` alone, at most twice a day). The fleet-level state
  (`fleetHash`, `referenceHash`, `fleetCheckedAt`) lives at a **new key**
  `private/fleet-state.json`, written only when a hash changed or the check
  time is over 12 hours old. The legacy `private/fleet-manifest.json` is
  never written again — it stays as the migration source (overwriting it
  with the slim state would have destroyed the per-yacht entries the
  migration reads). An unreadable state or fleet list is a `STORAGE` error:
  nothing is written and the cron answers 503. The "manifest unreadable,
  treating every item as new" fallback is gone.
- `src/server/in-use.mjs` — `selections/in-use.json`
  `{ "<yfId>": ["<selectionId>", …] }`, maintained inside `store()` and
  `deleteSelection()` in `src/server/pages.mjs` (a yacht counts as in use
  while it is in the draft or on the draft's live page). `rebuildInUseIndex()`
  behind `POST /api/admin/rebuild-in-use-index` is the only `list()`.
- `src/server/cron-auth.ts` — `requireCronSecret()` for the admin routes
  (bearer `CRON_SECRET` only; no portal-session alternative).
- `storage.mjs` — `noteStorageError()` / `lastStorageError()`; `/api/health`
  reports the message, its context and time.

### Phase 3 — Sirv pipeline (`0032427`)

- `src/server/image-store/sirv-pipeline.mjs` — `prepareYachtImages(yfId,
  { force })` (claim + run) and `runPreparation()`: one original per image,
  no sharp, uploaded to `${SIRV_ROOT_PATH}/<yfId>/<yfId>.<pos>.jpg`,
  overwriting in place, four in flight; a position is kept when its
  Yachtfolio image id and store match (unless forced); trailing files from a
  longer previous list are deleted and logged; overwrites caused by a
  removal shifting later positions are counted and logged per run, as are
  Yachtfolio and Sirv calls. `imageUrls(record, variant)` and
  `imagesResponse(record)` render Sirv and legacy Blob entries alike.
- `src/server/yachtfolio/client.mjs` — every API call and media download is
  counted (`yachtfolioOps()`); a 429 or a rate-limit error body backs off
  2 s, 8 s, 30 s, then throws `RateLimitError` (`code: "RATE_LIMIT"`);
  `fetchMedia()` downloads gallery images through the same accounting.
- `src/server/yachtfolio/gallery.mjs` — the shared helpers (brochure memo,
  `mapLimit`, `stripSecret`, `defaultSlots` — the "distinct exterior
  default" from `f3d9900` — `orderWithLead`), imported by both pipelines.

### Phase 4 — Routes, portal form, client pages (`6dc2353`)

- `GET /api/fleet/:yfId` — specifications from the record with
  `specsFetchedAt`; when Yachtfolio is unreachable, the record's data with
  `stale: true` and the reason instead of a 502. Never any image work.
- `GET /api/fleet/:yfId/images` — read-only (status, counts, URLs); no
  writes, no Yachtfolio calls.
- `POST /api/fleet/:yfId/images/prepare` — claims the job, answers 202 with
  the record at once, runs the work after the response is sent
  (`after()` from `next/server`). Consultant session required.
- `POST /api/fleet/:yfId/refresh` — refetches specifications and facts and
  re-prepares every image with force; one call per yacht per minute.
- `src/server/image-store/prepare.mjs` — the store dispatch (`readImages`,
  `startImages`, `prepareImages`); on the Blob store the original
  synchronous `getYachtImages()` runs behind the same claim.
- `src/server/auth/index.ts` — one startup warning when the provider is
  `solo` and `PORTAL_ACCESS_KEY` is unset; the portal is not locked.
- Portal forms (`src/components/portal/PortalForm.tsx`, `Tier2Form.tsx`,
  shared client `fleetApi.ts`) — specs shown at once with "Updated 09
  September 2026"; prepare then poll every three seconds; header shows
  "Preparing images, 4 of 20"; thumbnails render as they arrive; a
  "Refresh from Yachtfolio" control per yacht; "Showing details from 09
  September 2026; Yachtfolio could not be reached" inline when stale.
- Publish (`src/lib/portal-map.ts`, `src/app/api/selections/[id]/publish/route.ts`)
  — each yacht gains `imageRefs` (the Yachtfolio image id chosen per slot)
  and `imagesAtPublish` (the slot URLs at publish, reference only, stripped
  before the page is rendered).
- Client pages (`src/app/selection/[slug]/page.tsx`,
  `src/app/atlas/[slug]/page.tsx`, `src/server/live-images.mjs`,
  `src/components/HoldingPage.tsx`) — slots resolved from the yacht's
  current record at render time; a holding page with the consultant's
  contact details when the snapshot or a record cannot be read.

### Phase 5 — Cron redesign (`860ccc0`)

- `src/server/nightly.mjs` — `runNightlySync()`: list diff → in-use refresh
  (changed or seven days unchecked, oldest first, at most 40, within 300
  calls and an 85-second time budget) → facts gap fill from the brochure
  (at most 100, from the call and time budget left) → one `fleet.json`
  write. Yachts not in use never get a record or images; the one call ever
  made for one is a brochure read for its three picker facts. `fetchFleetFacts()` and the cron route's chained
  follow-up runs are removed. `RateLimitError` curtails the run
  (`curtailed: true`, still 200); a storage failure answers 503.
- `src/server/fleet.mjs` — `fetchFleetSnapshot()` / `persistFleet()`;
  facts are fetched once and cached, refreshed for free from list rows that
  carry builder or length, and by "Refresh from Yachtfolio" per yacht.
- `vercel.json` — untouched (`0 3 * * *`, 03:00 UTC).

### Phase 6 — Backfill (`0b30eb3`)

- `src/server/backfill.mjs`, `scripts/backfill-sirv.mjs`
  (`npm run sirv:backfill [-- N | --facts N]`),
  `POST /api/admin/backfill-sirv?limit=N`,
  `POST /api/admin/backfill-facts?limit=N`,
  `GET /api/admin/sirv-readdir?path=` (all `CRON_SECRET`).

### Environment variables

| Variable | Purpose |
| --- | --- |
| `IMAGE_STORE` | `blob` (default) or `sirv`. Selects the pipeline. `sirv` is honoured only when the three variables below are present. |
| `SIRV_CLIENT_ID`, `SIRV_CLIENT_SECRET` | Sirv REST API client (Sirv account → Settings → API). |
| `SIRV_BASE_URL` | Public Sirv CDN origin, e.g. `https://<account>.sirv.com`. No trailing slash (one is stripped if present). |
| `SIRV_ROOT_PATH` | Campaign folder. Default `/yachtfolio_images`; each yacht has its own subfolder beneath it named for the Yachtfolio id. |
| `SIRV_PROFILE_HERO`, `SIRV_PROFILE_THUMB` | Sirv profile names; default `charter-hero`, `charter-thumb`. |

Test-only overrides, never set in Vercel: `SIRV_API_BASE` (mock Sirv),
`YACHTFOLIO_RATE_LIMIT_DELAYS_MS`, `FLEET_BROCHURE_MEMO_MS`. Existing:
`YACHTFOLIO_API_BASE`, `PORTAL_STORE_DIR`, `FLEET_REFRESH_DRY_RUN`.

## 2. Action items for Eleanor, in order

1. **Set `PORTAL_ACCESS_KEY` in Vercel Production.** With
   `PORTAL_AUTH_PROVIDER=solo` and no key, every visitor is the solo
   consultant and every portal route — including the ones that now write to
   Sirv — is open. The app logs one warning at startup and `/api/health`
   shows `portalAccessKeyConfigured: false` until this is done.
2. **Create the two Sirv profiles** in `my.sirv.com → Profiles → New
   profile`, named exactly `charter-hero` and `charter-thumb`. In the
   profile editor set, under *Image → Scale*: width **2000**, height **1250**
   for `charter-hero` (width **1000**, height **625** for `charter-thumb`),
   scale option **Fill** (crops to fill the box, keeping the aspect ratio,
   from the centre); leave *Crop* unset; under *Format*: JPEG, quality
   **82** (matching the sharp output the Blob pipeline produced; Sirv's
   default is 80). As JSON the profile should read
   `{ "image": { "scale": { "width": 2000, "height": 1250, "option": "fill" }, "quality": 82, "format": "jpg" } }`
   — check the editor's JSON view agrees, as the exact keys could not be
   confirmed from the documentation during the build. The MYBA watermark
   sits at the centre of every Yachtfolio image; a centred 16:10 crop keeps
   it. Confirm on one image that the fill crop is centred (section 6).
3. **Add the Sirv variables in Vercel** (`SIRV_CLIENT_ID`,
   `SIRV_CLIENT_SECRET`, `SIRV_BASE_URL`; `SIRV_ROOT_PATH` and the profile
   names only if they differ from the defaults), then set
   `IMAGE_STORE=sirv`, redeploy, and open `/api/health`: expect
   `imageStore: "sirv"`, `sirvConfigured: true`,
   `sirvRootPath: "/yachtfolio_images"`. If it says `imageStore: "blob"`
   with `imageStoreRequested: "sirv"`, a variable is missing.
4. **Check the campaign folder once**:
   `GET /api/admin/sirv-readdir?path=/yachtfolio_images` with
   `Authorization: Bearer $CRON_SECRET`. Note the filename pattern of the
   existing CRM images (section 6, item 4) before running the backfill.
5. **Rebuild the in-use index once**:
   `POST /api/admin/rebuild-in-use-index` (same bearer). The response gives
   the number of selections and yachts in use. Saves from then on keep it
   current.
6. **Run the Sirv backfill in batches** until it reports `remaining: 0`:
   `POST /api/admin/backfill-sirv?limit=10` (same bearer). Each yacht costs
   about 21 Yachtfolio calls (brochure plus up to 20 images) and up to 20
   Sirv uploads, so ten per call stays well inside both limits; wait a few
   minutes between calls if the CRM sync could be running. `/api/health`
   and the record (`yachts/<id>.json`) show `store: "sirv"` afterwards.
7. **Run the facts backfill** until `remaining: 0`:
   `POST /api/admin/backfill-facts?limit=50`, one call a minute. Facts come
   from the brochure (`api_brochure.cgi?id_yacht=`), one call per yacht,
   for every yacht including the agency's 97: about 2,300 calls from cold,
   so 47 calls of 50 — under an hour at that pacing, or leave it to the
   nightly gap fill of 100 a night. Each response reports `filled`,
   `recordsFetched`, `recordsFailed`, `remaining`, `curtailed`, `timedOut`,
   `fleetWritten`, `elapsedMs` and, when something failed, `firstFailure`
   (HTTP status, passkey-redacted URL, message). A batch in which every
   brochure failed answers 502 with `error`. `remaining` must fall by
   `filled` on every call. Pacing: 50 brochures plus the 4 fixed calls a
   minute is 270 per five minutes, a third of the 800 shared with the CRM
   sync; the batch stops itself at 85 s and reports `timedOut` if Yachtfolio
   is slow, so `limit` can never outrun the function.
8. **Confirm with Markus** that 03:00 UTC does not overlap the existing
   Yachtfolio-to-CRM sync. The schedule is unchanged by this work, and the
   429 curtailment means an overlap degrades into a slower catch-up rather
   than a failure, so this is a check rather than a blocker.

## 3. Verification on Vercel

- **`/api/health`** — `imageStore`, `sirvConfigured`, `sirvRootPath`,
  `portalAccessKeyConfigured`; `lastStorageError` should be `null` (a
  non-null value now carries `lastStorageErrorContext` and
  `lastStorageErrorAt`; the 403 the audit saw on private reads would appear
  here with the key it hit). The response is 503 while an error stands.
- **Cron JSON** (`GET /api/cron/fleet-sync` with the bearer) —
  `fleet { count, changed, fleetWritten, referenceWritten, stateWritten }`,
  `inUse`, `candidates`, `processed`, `skipped`, `imagesPrepared`,
  `curtailed`, `candidatesRemaining`, `facts { filled, remaining,
  curtailed }`, `yachtfolioCalls`, `sirvUploads`, `blob { puts, dels,
  lists, advanced }`, `storageError`. Status 200 unless `storageError` is
  set (503). A healthy quiet night reads `candidates: 0`,
  `blob.advanced: 0` or `1`, `yachtfolioCalls: 4` plus the gap fill.
- **Function logs** — `[nightly] …` (one summary line per run),
  `[sirv:<yfId>] ready: N position(s), U uploaded (O overwrite(s)), S
  unchanged, D deleted, F failed; Yachtfolio calls …, Sirv calls …`,
  `[sirv:<yfId>] deleted trailing …`, `[fleet:sync|detail|images] Blob
  advanced operations this run: …`, `[image-store] IMAGE_STORE=sirv but …`
  (misconfiguration), `[auth] PORTAL_AUTH_PROVIDER=solo with no
  PORTAL_ACCESS_KEY …`, `[storage] <context>: <message>`.
- **A published page** — view source: image `src` attributes on
  `https://<account>.sirv.com/yachtfolio_images/<yfId>/<yfId>.<pos>.jpg?profile=charter-hero`
  (thumbnails in the portal picker end `?profile=charter-thumb`). No
  `imagesAtPublish` in the page. A page published before the switch keeps
  its Blob URLs.
- **Portal** — pick a yacht: specs fill at once with "Updated <date>", the
  header counts "Preparing images, 4 of 20", thumbnails appear as they
  arrive; "Refresh from Yachtfolio" re-runs both.

## 4. The rule: specs are frozen at publish; images are live

A published client page shows the specifications, rate and notes exactly as
they were when the consultant published — the client has been sent that
page, and a rate or a stateroom count must not change under them. The
photographs are the exception, deliberately: the page always shows the
yacht's *current* prepared photos, resolved from `yachts/<yfId>.json` when
the page renders. A photo replaced in Yachtfolio (and re-prepared, nightly
or with "Refresh from Yachtfolio") therefore appears on every page that
uses that yacht, without republishing. The snapshot keeps, per image slot,
the Yachtfolio image id the consultant chose (`imageRefs`): the page shows
that image's current file; if it has left the gallery, the record's default
for that slot; a URL the consultant pasted, a hand-entered yacht or a page
published before this change keep their stored URL. For consultants: choose
images as before; a change in Yachtfolio's gallery may move a chosen photo's
position or replace it with the category default, and "Refresh from
Yachtfolio" is the way to pull a corrected photo through today.

## 5. Known limitations

- **Positional overwrite shifts on removal.** Files are named by display
  position, so an image removed in Yachtfolio shifts every later position
  and rewrites those files (counted in the log). Because a published slot
  is keyed by image id, not position, the page still shows the right
  photo — at its new position.
- **In-place byte changes are undetected** while the Yachtfolio image id
  stays the same; only "Refresh from Yachtfolio" (force) picks them up.
- **Browser cache after an overwrite.** Sirv purges its CDN within seconds,
  but the account's default browser TTL is seven days, so a client who has
  the page open may see the old photo for up to a week after an overwrite.
  Lower the TTL in Sirv's account settings if that matters. Sirv also
  allows at most 1,000 overwrites per file and counts an overwrite double
  against the hourly upload limit (2,000).
- **Five-minute `preparing` timeout.** A second caller within five minutes
  of a claim does nothing; a job that died is restarted after five minutes.
  The portal stops polling after two minutes and says so.
- **Per-run caps.** At most 40 in-use yachts and 300 Yachtfolio calls a
  night, 100 facts a night; a large backlog drains over several nights,
  oldest first. `candidatesRemaining` and `facts.remaining` in the cron
  response show the queue. The backfill routes drain it faster.
- **`curtailed: true`** in the cron response means a Yachtfolio rate limit
  was hit after the back-off: the run stopped cleanly, wrote what it had,
  and left `candidatesRemaining` for the next night. It is not a failure;
  repeated nights of it mean the CRM sync overlaps the 03:00 UTC run.
- **Blob images store still present** for pages published before the
  switch and for records migrated with `store: "blob"` until backfilled.
  Nothing is deleted from it; retirement is a separate task.
- **Blob store `force`.** On `IMAGE_STORE=blob`, "Refresh from Yachtfolio"
  refetches specs and re-runs the unchanged Blob pipeline, which reuses
  images by id; a forced re-download applies to the Sirv store only.
- **In-use index races.** Two consultants saving different selections at
  the same moment can lose one update to the index; the next save of that
  selection, or the rebuild route, repairs it.
- **Facts for yachts not in use** live only in `fleet.json` (one write per
  night), not in per-yacht records — a record per listed yacht would cost
  2,398 Blob operations, more than a month's allowance, for yachts nobody
  has picked. `fleet.json` is written whenever facts were added in a run,
  independently of the list's content hash. A brochure that fails is
  stamped `factsTriedAt` and goes to the back of the queue rather than
  blocking it; a batch in which every brochure failed is an error.
- **Facts come from the brochure, not the basic record.** Confirmed on the
  preview on 14 September 2026: `api_basic.cgi?type=yachts&id_yacht=<id>`
  answers `HTTP 200 {"data":[],"errors":[]}` for a charter-list yacht — it
  has never returned a record. The earlier whole-fleet pass (`d4ba9b0`) had
  stamped 989 yachts with a read time and empty facts on the strength of
  that empty answer; those stamps are re-queued once (`factsPending()`,
  keyed on a missing `factsSource`) and an empty answer from the brochure
  is final. The agency basic list (`type=yachts`, no id) is no longer read
  on any scheduled path; `?debug=1` on the backfill samples ten of its rows
  for `builder` / `other_builder` counts only. The basic record remains a
  silent fallback inside `getYachtDetail()` (one call per detail fetch, no
  data ever); removing it is a separate decision.
- **The agency basic-list row carries internal and personal data**
  (`yacht_admin_email`, `yacht_admin_phone`, `captain`, `crew_profiles`,
  `notes`, `rate_det` and more). Rule: read only `builder`, `length_metric`
  and `summer_base_port` from it (`factsFromBasic()`), never persist, cache
  or log a row whole, and never let any of it reach a per-yacht record, a
  published snapshot or a client-facing response. The list row from
  `type=list` and the brochure are the only Yachtfolio payloads the app
  stores anything from, and only their normalised fields.

## 6. Unverified in the build session, and how to verify on first deploy

1. **Sirv upload parameter and overwrite.** The reference documents
   `POST /v2/files/upload?filename=` with raw bytes and "if the folder path
   does not already exist, it will be created"; no `overwrite` flag is
   documented and the help centre states files may be overwritten. Verify:
   run the backfill for one yacht, then `sirv-readdir?path=/yachtfolio_images/<yfId>`
   and refresh the same yacht; the files should be replaced, not duplicated
   or rejected. If Sirv rejects the second upload, an `overwrite` query
   flag is the first thing to try in `sirv-client.mjs`'s `upload()`.
2. **Centred crop under `scale.option=fill`.** Open one uploaded original
   with `?profile=charter-hero` and check the MYBA watermark is centred and
   whole. If the crop anchors elsewhere, set the profile's crop position to
   centre (or add `cx=center&cy=center` to the profile).
3. **Profile JSON keys** (section 2, item 2).
4. **Filename convention of the existing CRM images.** The code uses
   lowercase `.jpg` and unpadded positions (`12041.0.jpg`), set in one place
   (`IMAGE_EXTENSION`, `padPosition` in `sirv-pipeline.mjs`). Check with
   `sirv-readdir` whether the CRM files are `.JPG` or zero-padded and
   whether anything already in `/yachtfolio_images/<yfId>/` collides with
   `<yfId>.<pos>` — the backfill overwrites such files.
5. **Yachtfolio `last_modified`.** The brochure carries it (observed live
   in September and noted in `normalise.mjs`); it is stored on the record
   as `yfLastModified` but not yet used for skipping. The fleet list carries
   no per-yacht timestamp, which is why the nightly diff compares headline
   fields. Verify with `GET /api/fleet/<id>?debug=1`.
6. **The 403 on private Blob reads** the audit inferred. With this branch
   it can no longer be silent: `/api/health` shows the context and the cron
   answers 503 with the message. If it appears, check that
   `PORTAL_DATA_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN`) belongs to a
   private store the code may read with `access: "private"`.
7. **Function duration.** The prepare and refresh routes declare
   `maxDuration = 120` (as the cron already did) and continue after the
   response with `after()`; a 20-image yacht should complete in well under
   a minute. If the plan caps functions lower, the job is restarted by the
   next poll after the five-minute claim expires.
