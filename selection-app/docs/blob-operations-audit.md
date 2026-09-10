# Blob operations audit — fleet sync cron and image pipeline

Read-only audit carried out 10 September 2026 on branch
`claude/blob-operations-audit-ghvun1` at commit `cad7ef2` (identical to
`origin/main`). No application code was changed. All file paths below are
relative to `selection-app/`; line numbers refer to that commit.

## Summary

- **The nightly cron does not process images at all.** `/api/cron/fleet-sync`
  calls `syncFleet()`, which fetches the fleet list and reference data and
  writes at most three JSON documents. There is no yacht loop and no image
  loop on the cron path. Images and per-yacht detail records are written only
  on demand, when a consultant picks a yacht in the portal form.
- **The manifest is read before anything is written, and it is compared.**
  `startRun()` loads `private/fleet-manifest.json` once at the top of every
  run; fleet, reference and detail writes are skipped when the content hash
  matches, and gallery images already recorded are returned without a
  download or a write. `list()` is no longer reachable from the cron handler
  or from any runtime route.
- **Steady-state cost of a cron run is one advanced operation** (the manifest
  itself, because the check timestamp changes every night). A first run, or a
  run with an empty manifest, costs three. Neither comes anywhere near the
  Hobby allowance of 2,000 per month.
- **The live deployment reports a Blob read failing with 403 Forbidden.**
  `/api/health` on `charter-campaign-q4.vercel.app` returned
  `lastStorageError: "Vercel Blob: Failed to fetch blob: 403 Forbidden"`. Every
  private-store read goes through the same `get()` call with the same token,
  so if this is what the manifest read hits, the manifest is treated as empty
  on every run and the idempotency is defeated in production even though the
  code is correct. This could not be confirmed from outside; see Phase 2.
- **The portal API, including the cron endpoint, is publicly callable.** The
  production health response shows the `solo` auth provider, and an
  unauthenticated request to the cron endpoint returned 200. With no
  `PORTAL_ACCESS_KEY` set, anyone can trigger a sync or request
  `/api/fleet/:yfId/images`, which is the only route that writes images.

---

## Phase 0 — Location and history

### Cron entries in `vercel.json`

| Path | Schedule | Handler |
| --- | --- | --- |
| `/api/cron/fleet-sync` | `0 3 * * *` (03:00 UTC daily) | `src/app/api/cron/fleet-sync/route.ts` |

That is the only cron. There is no route named `fleet-refresh`; the task's
"fleet-refresh cron handler" is taken to mean this one. The handler
(`route.ts:13-34`) checks `CRON_SECRET` or a portal session, then calls
`syncFleet()` from `src/server/fleet.mjs` and logs the run's Blob counters.

### When the manifest idempotency was committed

`git log --oneline -- selection-app/src/server/fleet.mjs` (most recent first):

```
1b29933 2026-09-10 Force Yachtfolio area names out of capitals; four more UI tweaks
6b0660a 2026-09-09 Add the Tier 2 Personalised Atlas: client page, portal form and demo fallback
f33d74f 2026-09-08 Make the fleet refresh and image pipeline idempotent; count Blob operations
f3d9900 2026-09-07 Distinct exterior default, uncacheable client pages, drag-to-reorder yachts
7329d99 2026-09-07 Fill specs immediately; prepare images separately and in parallel
...
6ed811d 2026-09-04 Add Charter Portal consultant form with dynamic Yachtfolio fleet
```

The manifest was introduced in a single commit, `f33d74f`, authored
08 September 2026 at 10:27 UTC. It is the only commit in the repository that
adds or removes the string `fleet-manifest` (`git log -S`). It touched
`fleet.mjs`, `storage.mjs`, `pages.mjs`, the cron route, the fetch CLI and
the portal form. The two later commits to `fleet.mjs` are UI and Tier 2
changes; neither alters the manifest logic.

### Production branch and ancestry

- The repository's default branch on GitHub is `main`. Vercel deploys the
  default branch to Production unless a project overrides it; the repository
  contains no `.vercel/` directory or project settings, and the GitHub tools
  available to this session expose no deployment records, so **the
  Production branch could not be confirmed from the repository**. It is
  assumed to be `main`.
- `f33d74f` **is an ancestor of `origin/main`** (`cad7ef2`, merge of pull
  request 25, 10 September 2026) and therefore of every later commit. If
  Production tracks `main`, the manifest code is deployed.
- Live evidence that the Next.js app is deployed: `https://charter-campaign-q4.vercel.app/api/health`
  answers with the app's health JSON (`cronSecretConfigured: true`, both Blob
  stores configured, `passkeyConfigured: true`, `demoFleet: false`,
  `auth.provider: "solo"`, fleet count 2,398). Which commit is deployed
  cannot be read from that response.

---

## Phase 1 — Write path reachable from the cron handler

### Import graph from `src/app/api/cron/fleet-sync/route.ts`

```
route.ts
├── @/server/fleet.mjs  (syncFleet)
│   ├── ./yachtfolio/client.mjs     (HTTP to Yachtfolio only, no Blob)
│   ├── ./yachtfolio/normalise.mjs  (pure functions, no Blob)
│   ├── ./yachtfolio/images.mjs     (sharp cropping, no Blob)
│   ├── ./storage.mjs               (the ONLY module that imports @vercel/blob)
│   └── ./demo/fleet.mjs            (static demo data, no Blob)
└── @/server/portal-auth            (crypto + cookies, no Blob)
```

`@vercel/blob` is imported in exactly one place, `storage.mjs:52`, via a
dynamic `import()`. Every SDK call in the codebase is listed below.

### Every `@vercel/blob` call site

| SDK call | File and line | Wrapper | Reachable from cron | Notes |
| --- | --- | --- | --- | --- |
| `put` | `src/server/storage.mjs:136` | `putJson()` | **yes** | Private DATA store, JSON. Counted in `ops.puts`. |
| `put` | `src/server/storage.mjs:234` | `putFile()` | no | Public IMAGES store. Called only from `fleet.mjs:526` (`getYachtImages`) and `src/server/atlas/content.ts:220` (`prepareAtlasImage`). |
| `del` | `src/server/storage.mjs:187` | `deleteJson()` | no | Called only from `pages.mjs:259, 354` (selection delete, legacy migration). |
| `list` | `src/server/storage.mjs:203` | `listKeys()` | no | Called only from `pages.mjs:269` (`listSelections` with `scope: "all"`). |
| `list` | `src/server/storage.mjs:259` | `listImageFiles()` | no | **No callers anywhere.** Dead export since `f33d74f`. |
| `head` | `src/server/storage.mjs:282` | `fileExists()` | no | Called only from `atlas/content.ts:208`. |
| `head` | `src/server/storage.mjs:298` | `fileUrl()` | no | Called only from `atlas/content.ts:209`. |
| `get` | `src/server/storage.mjs:158` | `getJson()` | yes | A read. Not an advanced operation and not counted. |
| `copy` | — | — | — | Not used anywhere. |

### Each `put()` reachable from the cron, and its guard

The cron path is `syncFleet()` (`fleet.mjs:242-311`). It can perform three
JSON puts, all through `putJson()`:

1. **`yachtfolio/fleet.json`** — `fleet.mjs:284-285`. Guarded by
   `if (fleetContentHash !== run.manifest.fleetHash)`. The hash excludes
   `syncedAt`, so an unchanged list is not rewritten.
2. **`yachtfolio/reference.json`** — `fleet.mjs:291`, via `writeIfChanged()`
   → `putJsonIfChanged()` (`storage.mjs:112-120`). Skipped when the hash
   equals `run.manifest.referenceHash`.
3. **`private/fleet-manifest.json`** — `finishRun()`, `fleet.mjs:197`.
   Guarded by `if (run.dirty)`, but `syncFleet()` sets `run.dirty = true`
   unconditionally at `fleet.mjs:297` (because `fleetCheckedAt` is updated
   every run). **This put is therefore effectively unconditional: one
   manifest write per sync, whether or not anything changed.**

There is no `putFile()` on the cron path, so no image is ever written by the
cron. Nothing on the cron path can delete or list.

### Does `list()` appear anywhere reachable from the cron handler?

**No.** The pre-manifest code (`f33d74f^`, `fleet.mjs:324`) called
`listImageFiles(prefix)` on every gallery request; that call was removed in
`f33d74f` and `listImageFiles` now has no callers at all. The remaining
`list()` use, `listKeys()` in `pages.mjs:269`, is reached only from
`GET /api/selections?scope=all` for a consultant permitted to view every
selection. It is not reachable from the cron, from `getFleet()`, from
`getYachtDetail()` or from `getYachtImages()`.

### Other entry points to the same write path

These are not the cron, but they run the same code and cost the same
operations:

- `getFleet()` (`fleet.mjs:314-338`) calls `syncFleet()` lazily when the
  cached fleet is older than 36 hours. It is invoked by `GET /api/fleet` and
  `GET /api/health`.
- The cron endpoint itself accepts a signed-in consultant as well as the
  `CRON_SECRET` bearer (`route.ts:18`), so it can be triggered manually.
- `npm run yachts:fetch` (`scripts/fetch-yachtfolio.mjs`) runs `syncFleet()`
  and, for any ids passed, `getYachtDetail()` and `getYachtImages()`.

---

## Phase 2 — Manifest logic

### Where `private/fleet-manifest.json` is read or written

| Access | File and line | Function | Purpose |
| --- | --- | --- | --- |
| read | `fleet.mjs:160` | `startRun()` | Load once at the start of every run (sync, detail, images). |
| read | `fleet.mjs:184` | `finishRun()` | Re-read the stored copy before merging this run's touched entries, to limit lost updates between concurrent on-demand runs. |
| read | `fleet.mjs:321` | `getFleet()` | Use `fleetCheckedAt` to decide staleness, since an unchanged `fleet.json` keeps its old `syncedAt`. |
| write | `fleet.mjs:197` | `finishRun()` | Write once per run, only when `run.dirty`. |

The key is defined once, `MANIFEST_KEY` at `fleet.mjs:42`, with
`MANIFEST_VERSION = 1` at line 43. No other module touches it.

### Is the manifest read before the image loop?

**Yes.** `getYachtImages()` (`fleet.mjs:488-619`) calls
`await startRun("images")` at line 495 and takes the yacht's entry at line
496, before the brochure is fetched and before `mapLimit()` starts the image
loop at line 503. The same ordering holds in `getYachtDetail()` (run started
at line 425, before the write at 431) and `syncFleet()` (line 251, before
any write).

### Are content hashes compared?

**Yes, for JSON. Images are matched by source URL, not by hash.**

- Fleet list: `hashJson(fleetContent)` compared with `manifest.fleetHash`
  (`fleet.mjs:282-284`).
- Reference data: hash compared inside `putJsonIfChanged()`
  (`storage.mjs:114`).
- Per-yacht detail: `hashJson(content)` compared with `entry.detailHash`
  (`fleet.mjs:428-430`); `fetchedAt` is excluded so a refetch with identical
  facts is not written.
- Images: the check at `fleet.mjs:507-511` is
  `entry.images[source]` where `source` is the passkey-stripped Yachtfolio
  URL. If `url` and `smallUrl` are recorded, the image is returned without
  downloading, cropping or writing. A hash of the processed bytes is stored
  at line 529 but is never compared; comparing it would require downloading
  and processing the image first, which is what the URL match avoids. This
  is a reasonable design, not a defect.

### Is there an early continue or return that skips `put()`?

**Yes, in every path.**

- Images: `return {...known}` at `fleet.mjs:510` before any `fetch` or
  `putFile`.
- Detail: the `if (contentHash !== entry.detailHash)` at line 430 wraps the
  only write; the `else` branch at 437 increments `yachtsSkipped`.
- Fleet and reference: guarded as described in Phase 1.

### Does the manifest cover yacht JSON records, processed images, or both?

**Both**, plus the fleet list and reference data. The per-yacht entry
(`manifestYacht()`, `fleet.mjs:208-212`) is
`{ detailHash, images: { [sourceUrl]: { hash, url, smallUrl, key, category, id } } }`.
The top level carries `fleetHash`, `referenceHash` and `fleetCheckedAt`.

### Is the manifest written but never read?

**In the code, no**: it is read at the start of every run. **In production
the read may be failing.** This is the most important finding of the audit
and is stated as an inference, not a confirmed fact:

- `/api/health` on the live site reports
  `lastStorageError: "Vercel Blob: Failed to fetch blob: 403 Forbidden"`.
  That string is set only by `readStoredJson()` / `writeStoredJson()` /
  `writeIfChanged()` in `fleet.mjs`, and "Failed to fetch blob" is the SDK's
  message for a failed download, so a **read** of the private DATA store is
  being refused.
- Every private read, including the manifest read at `fleet.mjs:160`, uses
  the same `get(key, { access: "private", token, useCache: false })` call
  (`storage.mjs:158`) with the same token. A 403 on one key almost certainly
  means a 403 on all of them.
- `startRun()` catches that error (`fleet.mjs:161-163`), logs
  `manifest unreadable (...) — treating every item as new and rebuilding it.`,
  and continues with an empty manifest. The run then behaves exactly as an
  empty-manifest run: every comparison fails, every put happens, and the
  rebuilt manifest is written, only to be unreadable again next time.
- The same 403 would also defeat the detail cache (`fleet.mjs:361`) and the
  `fleet.json` read, which is consistent with the health response serving the
  fleet from the in-memory fallback populated by a sync moments earlier.

If this is what is happening, the manifest is **written on every run and
never successfully read**, and the on-demand image path costs its full
empty-manifest price on every request (see Phase 3). The decisive evidence
is the cron's own JSON response (`manifest: "rebuilt"` plus the note above)
or the Vercel function logs for the string `manifest unreadable`. An
unauthenticated probe of the cron endpoint during this audit returned
HTTP 200, but only headers were captured; a second call to capture the body
was not permitted by the session's tooling, so this remains unconfirmed.

Likely causes to check in the Vercel dashboard, in order: the token in
`PORTAL_DATA_READ_WRITE_TOKEN` (or the `BLOB_READ_WRITE_TOKEN` fallback,
`storage.mjs:35`) belongs to a **public** store while the code reads with
`access: "private"`; the token belongs to a different store from the one the
writes go to; or the token lacks read scope.

### Other observations on the manifest code

- **The manifest is rewritten every sync regardless of change.**
  `run.dirty = true` at `fleet.mjs:297` and the `fleetCheckedAt` update make
  the "only if something changed" comment on `finishRun()` untrue for the
  sync path. The cost is one put per run, about 30 per month at the nightly
  schedule. It is deliberate (the timestamp drives `getFleet()` staleness),
  but it could be avoided by recording the check time elsewhere or writing
  only when the recorded time is more than, say, 12 hours old.
- **Concurrent on-demand runs can still lose image entries.** `finishRun()`
  re-reads and merges only the touched yacht ids, which covers different
  yachts well. Two simultaneous `getYachtImages()` calls for the *same*
  yacht (two browser tabs) would both process and both write; the second
  merge wins. Cost is bounded by one duplicated gallery.
- **Images are skipped only when both URLs are recorded**
  (`fleet.mjs:508`). An entry written before a failed small-size put would be
  reprocessed next time. Correct behaviour, noted for completeness.
- **`listImageFiles()` is dead code** (`storage.mjs:251-274`). Harmless, but
  it is the one remaining `list()` against the IMAGES store and could be
  removed to make the "nothing is listed" guarantee structural.

---

## Phase 3 — Arithmetic

### Inputs

| Quantity | Value | Source |
| --- | --- | --- |
| Yachts in the fleet | 2,398 | Live `/api/health` response, 10 September 2026 |
| Gallery categories | four (FULL, EXTERIOR, LIFESTYLE, INTERIOR) | `images.mjs:18` |
| Cap per category | five | `GALLERY_MAX_PER_CATEGORY`, `fleet.mjs:50` |
| Images per yacht (maximum) | 20 | 4 × 5 |
| Derivative sizes | two (2000×1250, 1000×625) | `IMAGE_SIZES`, `images.mjs:9-12` |
| Puts per image | two | one `putFile()` per size, `fleet.mjs:522-528` |
| Hobby allowance | 2,000 advanced operations per month | Stated in the task |
| Cron frequency | once per night | `vercel.json` |

Advanced operations are `put`, `copy`, `del` and `list`. Reads (`get`) and
`head` are not counted. `head` is not reachable from the cron in any case.

### A single cron run, as the code actually behaves

| Write | (a) Empty manifest | (b) Populated, no upstream change |
| --- | --- | --- |
| `yachtfolio/fleet.json` | 1 | 0 (hash matches) |
| `yachtfolio/reference.json` | 1 | 0 (hash matches) |
| `private/fleet-manifest.json` | 1 | 1 (always dirty) |
| Image puts | 0 | 0 |
| Detail puts | 0 | 0 |
| `list` / `del` | 0 | 0 |
| **Total per run** | **3** | **1** |
| **Per month (30 nights)** | **90** | **30** |

Both scenarios are a small fraction of the allowance. If the 403 read
failure is real, every night is scenario (a): 90 per month from the cron,
still well within budget. **The cron is not where the operations go.**

### A single on-demand yacht (the path that does write images)

When a consultant picks a yacht, the portal calls `GET /api/fleet/:yfId`
(detail run) and `GET /api/fleet/:yfId/images` (images run). Working per
yacht:

| Write | (a) Empty manifest | (b) Populated, no change |
| --- | --- | --- |
| Detail JSON (`yachtfolio/details/:id.json`) | 1 | 0 |
| Manifest after the detail run | 1 | 0 (not dirty) |
| Image puts: 20 images × 2 sizes | 40 | 0 |
| Manifest after the images run | 1 | 0 (not dirty) |
| **Total per yacht** | **43** | **0** |

Under (a), the allowance is exhausted after 2,000 ÷ 43 ≈ **46 yacht picks**
in a month. Under (b) a pick costs nothing. If the manifest is unreadable in
production, every pick is (a), and so is every re-open of a yacht already
prepared, because the detail cache read fails too and the URL match has no
manifest to consult. Building one ten-yacht Tier 3 selection would cost about
430 operations; five such selections would exceed the month.

### Hypothetical whole-fleet run

The task asks for yachts × images × sizes. **No code path does this**: not
the cron now, not the cron before `f33d74f`, and not the fetch CLI (which
processes only the ids passed on the command line). The arithmetic is given
to show why it must stay that way:

| Term | Working | Operations |
| --- | --- | --- |
| Image puts | 2,398 yachts × 20 images × 2 sizes | 95,920 |
| Detail JSON puts | 2,398 | 2,398 |
| Fleet, reference, manifest | 3 | 3 |
| **Total, empty manifest** | | **98,321** |
| Months of Hobby allowance consumed by one run | 98,321 ÷ 2,000 | **49** |
| Total, populated manifest, no change | manifest only | 1 |

Even at one image per yacht it would be 2 × 2,398 + 2,398 + 3 = 7,197,
more than three months of allowance in one night. Any proposal to pre-warm
images for the fleet must be measured against this table.

### What the pre-manifest code cost, for comparison

Before `f33d74f` (`git show f33d74f^:selection-app/src/server/fleet.mjs`):

- `syncFleet()` wrote `fleet.json` and `reference.json` unconditionally: two
  puts per night, 60 per month.
- `getYachtImages()` called `listImageFiles()` on every request whose
  six-hour images cache had expired: one `list` per request, plus puts for
  images not already present. Images were keyed by Yachtfolio file id, so
  repeat requests did not rewrite them; the `list` was the recurring cost.

The manifest commit therefore removed one `list` per gallery request and one
put per night. It did not change the image-write volume for new yachts,
which was and is 40 puts per yacht.

---

## Findings for action

Listed in priority order. None has been acted on; this audit is read-only.

1. **Confirm and fix the 403 on private reads.** Check the Vercel function
   logs for `manifest unreadable` and `storage read failed`, and check that
   `PORTAL_DATA_READ_WRITE_TOKEN` (or the fallback `BLOB_READ_WRITE_TOKEN`)
   is a token for a private store that the code can read with
   `access: "private"`. Until this is resolved, every on-demand yacht costs
   43 operations on every open and the manifest provides no protection.
2. **Set `PORTAL_ACCESS_KEY` in production, or move off the `solo`
   provider.** With the gate disabled and `solo` returning a fixed identity
   for every visitor, `GET /api/fleet/:yfId/images` is callable by anyone and
   is the only route that writes images. The per-IP rate limit
   (12 per minute, `images/route.ts:82`) caps a single client at about 500
   operations per minute under an empty manifest. The cron endpoint is
   likewise callable without the bearer secret while the gate is off
   (`route.ts:18`, `portal-auth.ts:42`).
3. **Optional: stop writing the manifest on an unchanged sync.** One
   operation per night is affordable, but it is the only recurring cron cost
   and it contradicts the `finishRun()` comment.
4. **Optional: delete `listImageFiles()`** so that no `list()` against the
   IMAGES store remains in the codebase.

## What could not be completed

- **Production branch**: not recorded in the repository and not exposed by
  the GitHub tools available here; assumed to be `main`.
- **Deployed commit**: not readable from the live site.
- **Whether the manifest read is the call returning 403**: inferred from the
  health response and the shared code path, not observed directly. The cron
  response body or the function logs would settle it.
- **Actual advanced-operation usage for the month**: only visible in the
  Vercel dashboard, which this session cannot reach.
- **Per-yacht image counts**: the maximum of 20 is used throughout; real
  galleries may hold fewer than five images in some categories, so the image
  figures are upper bounds.
- **A live sync was triggered once during this audit** by an unauthenticated
  header-only probe of the cron endpoint (HTTP 200). It cost between one and
  three advanced operations. A second call to capture the response body was
  not permitted.
