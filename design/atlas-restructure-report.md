# Atlas restructure — build report

Branch `claude/atlas-restructure-itineraries-fleet`, 09 September 2026. Companion to
`design/atlas-restructure-notes.md` (the Phase 0 inspection) and
`design/itinerary-coverage.md` (every itinerary, every stop, regenerated on each build).

Everything below was verified on a production build (`next build` then `next start`)
driven headlessly in Chromium at 1440×900 and 380×800. No Vercel deployment was
available to this session, and no Yachtfolio passkey or Blob store, so the fleet page
was verified against the six-yacht demo fleet; the real-data numbers come from
`/api/fleet/report` once the Cron has run (see "Vercel steps").

## What changed, by phase

### Phase 1 — itineraries

- **Website sync** (`src/server/atlas/website.mjs`, `scripts/import-destinations.mjs`)
  now captures the itinerary pages the website links from each destination: the link
  cards (`itineraryLinks` per destination) and the itinerary pages themselves
  (`itineraries` in the snapshot, keyed by URL: title, nights, intro, day-by-day stops
  with the page's own map pins where it has them). Last run: 125 destination pages,
  32 itinerary pages, 75 destinations with links, zero errors.
- **Repo itineraries**: `selection-app/content/itineraries/<id>.json`, 125 files, one per
  destination, in the brief's shape. 113 destinations carry routes (108 with both a
  five-day and a seven-day route; 221 itineraries in all); the 12 region-level
  destinations (Caribbean, Arctic, …) carry an empty array. Every file is
  `"status": "placeholder"`; the status is stripped by the build and never rendered.
  All ports are real, with hand-authored coordinates; nothing is geocoded at build or
  run time.
- **Build step** `npm run build:itineraries` (also `prebuild`) validates the files
  (ids match filenames, destinations exist, sequential days, coordinates in range,
  unique itinerary ids), writes `data/itineraries.json` and rewrites
  `design/itinerary-coverage.md`. Three plausibility warnings remain for editorial
  review: two Antarctic legs of 185 and 199 nm and one Chilean leg of 130 nm, all
  genuine overnight passages.
- **Editorial state**: every Mediterranean stop has a full one-sentence day note.
  Outside the Mediterranean 481 of the day notes are still a bare place or a short
  phrase (Caribbean 138, Australia and New Zealand 56, South America 45, North America
  38, Central America 35, South Pacific 35, South East Asia 33, Indian Ocean 32,
  Arctic 24, Australasia 12, Middle East 12, Northern Europe 12, Antarctica nine).
  They read as terse rather than unfinished, but they need the same pass.

### Phase 2 — destination-led panel and route state

- `AtlasPanel.tsx` no longer shows yachts. Order: back link, eyebrow, title, places,
  hero, two-sentence intro with "Read the full guide", child destinations, key facts,
  "Suggested itineraries" (two cards), links to the website's itinerary library for the
  destination, then the full-width "View yachts for charter in <destination>" button.
  Destinations with one itinerary show one card; destinations with none hide the block.
- **Route state** in `AtlasPage.tsx`: choosing an itinerary saves the camera, draws the
  route and fits the camera to it; the panel becomes the day list. Hovering, tapping
  or scrolling the list sets the active day (scroll-follow is suppressed for 1.5 s
  after an explicit choice, and only runs when the list is long enough to scroll);
  tapping a numbered marker on the globe highlights its day and scrolls the row into
  view. "Back to <destination>" clears the route and restores the saved camera exactly
  (verified: the view after Back equals the view before the itinerary was chosen, to
  the metre).
- **Globe additions** (`src/lib/atlas/globe.ts`, existing component extended, no fork):
  - `setRoute(points | null)`: great-circle legs on a raised tube whose thickness is
    kept constant on screen (rebuilt when the zoom moves more than about 28 per cent),
    numbered DOM day markers with the place name shown for the active day; while a
    route is drawn every destination pin is dimmed to 35 per cent and unlabelled, and
    the idle drift pauses.
  - `setRouteActive(day)`, `getView()`, `flyToView(view)`, `fitPoints(points)`.
  - `fitPoints` frames a route on its spherical centroid so the farthest stop sits
    within half of the stage's half-size. Routes are a few ports a few miles apart, so
    the route zoom ceiling is 60 against the browsing ceiling of eight (wheel and pinch
    honour the same limit while a route is drawn). The coastline detail patch follows:
    at route zooms it paints the largest texture it can and clips the world's polygons
    to the window, so a repaint costs little. Camera flights now interpolate zoom
    geometrically, so the approach to a close-up feels even.
  - Test hook: the host element carries `__atlasGlobe` for headless verification.
- Mobile (380 px): the globe drops to 40svh in route mode so the day list shows below
  it; the header keeps only the logo and title.

### Phase 3 — public fleet page

- Route `/2027-charter-season/yachts/<destination id>` (catch-all, `force-dynamic`,
  `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600` from
  `next.config.ts`). Unknown ids are 404.
- **Data source**: a new fleet-wide facts document, `yachtfolio/fleet-facts.json`, built by
  the nightly Cron after the fleet list (`src/server/fleet-facts.mjs`). The existing
  fleet cache holds only id, name and port; length, rate, currency and operating areas
  exist per yacht only after a detail fetch, so the Cron now walks the fleet, stalest
  yachts first, one basic record per yacht (plus the image pipeline the first time a
  yacht is seen), inside a 200-second budget so a run always finishes. A fresh
  deployment fills the document over the first few nights. The page never calls
  Yachtfolio and never snapshots: every request reads the current document.
- **Selection** (`src/server/fleet-page.ts`, shared by the page and the report): the
  Tier 2 cruising-area matcher, now in `src/lib/area-match.ts` (the Tier 2 form's
  `mapCruisingArea` delegates to it, same signature, same results). A destination's
  terms come from `areaTermsFor()` in `content.ts`: its own name, its places and its
  parents down to country, plus its region. Yachts naming the destination are
  "specific" matches; when none do, yachts naming the region are listed instead; yachts
  the normaliser marks unavailable for the target season are left out. No match renders
  the empty state and logs `[fleet-page] no yachts map to <id> … — empty state rendered`.
- **Bands** (`src/lib/fleet-bands.ts`): Under 30m, 30 – 40m, 40 – 50m, 50m and above,
  lower bound inclusive, sorted by length descending inside each; "Further yachts"
  for yachts with no length. The only filter is the length-band chip row.
- **Rate line**: `fmtFromRate(currency, rateMin, apaPct)` → "From EUR 250,000 per week
  plus 35% APA plus VAT" from the weekly rate minimum in the yacht's own currency,
  never converted, never hidden; "Rate on application" when there is none. No APA
  amount, total or derived figure appears anywhere on the page or in the drawer.
- **APA source**: `DEFAULT_APA_PCT = 35` in `src/lib/portal-types.ts`, the Tier 3 default
  (`TIER2_DEFAULT_APA` and `emptyDraftYacht.apaPct` now derive from it). The fleet page
  and its drawer take `apaPct` from that constant; consultant per-yacht overrides live
  in Tier 3 drafts and are not read.
- **Card and drawer**: the Tier 3 card body was lifted out of `RingCarousel.tsx` into
  `YachtCardBody.tsx` (the carousel renders it unchanged; its own props are untouched)
  and takes an optional `rateLine`. `SpecPanel.tsx` gained an optional `rateLine` prop;
  when set it shows only the WEEKLY RATE row with that line and no VAT, APA or TOTAL
  rows. Without the prop both render exactly as before, so Tier 3 pages are unaffected.
- **Header and enquiry**: destination name, one-line lede from the Atlas content,
  "<n> yachts cruising <destination> in 2027", and "Back to <destination> in the Atlas"
  (`/2027-charter-season?destination=<id>`, which the Atlas deep-links). One enquiry
  CTA style throughout: the OI contact form with `utm_source=atlas`,
  `utm_medium=campaign`, `utm_campaign=2027-charter-season`, `utm_content=<destination
  id>`, `destination=<name>`, `yacht=<NAME>` from the drawer, and `consultant=…`
  carried through when the incoming URL has it. No consultant footer.
- **Verified** (demo fleet, Amalfi Coast): six yachts in four bands, chip filter narrows
  to one band, drawer shows the from-rate line only, enquiry links carry every
  parameter including a passed `?consultant=`, Escape closes, Antarctica renders the
  empty state, an unknown id is 404, no console errors, both viewports.

### Phase 4 — fallbacks and checks

- No `YACHTFOLIO_PASSKEY`: `getFleetFacts()` serves the demo fleet (`source: "demo"`).
  Passkey present but no facts document yet: demo fleet with `fallback: "facts cache
  missing"`, logged as `[fleet-facts] no fleet facts cached yet — serving the demo fleet
  until the Cron has run`, and the page logs `[fleet-page] <id>: facts cache missing;
  demo fleet shown`.
- Website fetch failures already fall back to the checked-in Atlas snapshot in
  `resolveDestination()` (logged); unchanged.
- Tier 2: `/atlas/harrington-summer-2027` renders (42 pins, no console errors); the
  form's destination pre-ticking goes through the shared matcher with identical logic.
- Tier 3: no route changed; `RingCarousel` and `SpecPanel` keep their signatures
  (SpecPanel's new prop is optional). `next build` and `tsc --noEmit` pass.
- The Yachtfolio passkey never reaches the browser: it is read only in
  `src/server/**` modules and the Cron route.

## Fleet data findings

The numbers below are from the demo fleet, because that is all this environment can
see. On Vercel, `GET /api/fleet/report` with `Authorization: Bearer $CRON_SECRET`
returns the same report from the real facts document (also open to a signed-in
consultant); run it after the first Cron passes complete and paste it here.

### Mapping gaps

With the demo fleet (six Mediterranean yachts) 24 destinations match specifically,
41 through their region and 60 have no match, which is every destination outside the
Mediterranean. With the real fleet the expectation is the reverse problem: Yachtfolio
operating areas are coarse ("West Mediterranean", "Caribbean"), so most cruising
grounds will list through the region fallback and a place-level destination will
rarely match specifically. The report shows the level per destination so the
consultants can judge whether the region fallback is acceptable or the mapping needs
a synonym table (for example "Côte d'Azur" → French Riviera, "Balearics" → Spain).

### Band distribution, missing data, currencies (demo)

| Length band | Yachts |
|---|---|
| Under 30m | 1 |
| 30 – 40m | 3 |
| 40 – 50m | 1 |
| 50m and above | 1 |
| Further yachts | 0 |

No demo yacht lacks a length or a rate; all six are EUR. The report lists any yacht
with no length (goes to "Further yachts"), no rate ("Rate on application"), every
currency seen (USD and GBP rates render as "From USD …", never converted) and every
`general.data_source` value.

### Yachtfolio field mapping notes

- The facts step reads the **basic record** only (`api_basic.cgi`): `length_metric`,
  `guests_sleeping`, `total_crew`, `builder`, cabin counts, `rates[season_id]`,
  `operating_areas_new[season_id].areas` and `seasons_unavailable`. That is all the
  listing needs and it halves the request count against a 400 ms per-request pace.
- `general.data_source` lives on the **brochure** record, which the facts step does not
  fetch, so `dataSource` is null in the facts document and the report will show
  "none" for real yachts. The normaliser handles the three known values
  (`auto`, `manual`, `text`, each moving the spec block) and flags unexpected ones;
  the brochure is still fetched, and the value seen, wherever the Tier 2 and Tier 3
  flows load a yacht. If the report needs it, the facts step can fetch the brochure on
  first sight only, at the cost of a slower first fill.
- Rate: the target season's minimum from `rates[]` (or the brochure prices where a
  brochure is present); the page never uses the maximum.
- Operating areas: names resolved through the cached reference data
  (`yachtfolio/reference.json`), so the facts step refuses to run until the fleet sync
  has cached it, and says so in its result.
- Yachts that leave the fleet list are dropped from the facts document on the next run.

## Vercel steps

1. Merge the branch (or point a preview at it). `prebuild` runs the itinerary build,
   so `data/itineraries.json` is always regenerated from `content/itineraries/`.
2. Environment variables (Production and Preview): `YACHTFOLIO_PASSKEY`,
   `BLOB_READ_WRITE_TOKEN` (fleet, reference and facts documents), `YFIMAGES_READ_WRITE_TOKEN`
   (processed images), `PORTAL_DATA_READ_WRITE_TOKEN`, `CRON_SECRET`,
   `NEXT_PUBLIC_SITE_URL` (canonical and Open Graph URLs). Nothing new is required
   beyond what Tier 2 and Tier 3 already use.
3. The Cron route now declares `maxDuration = 300` and spends up to 200 s on the facts
   step. That needs the Pro plan (or Fluid compute) function limit; on Hobby the route is
   cut at 60 s and the facts step should be given `budgetMs: 40_000` instead (one line in
   `src/app/api/cron/fleet-sync/route.ts`). The Cron stays at 03:00 UTC nightly
   (`vercel.json`).
4. After deploying, trigger `/api/cron/fleet-sync` once by hand with the bearer token
   to start the fill; the response's `facts` object reports `refreshed`, `remaining` and
   any per-yacht notes. Roughly 100 yachts are refreshed per 200-second run, so a
   417-yacht fleet is complete after four to five runs; the page serves the demo fleet
   until the first run has written the document, then whatever has been gathered.
5. Read `GET /api/fleet/report` with the same bearer and review the mapping gaps and
   the "Further yachts" and "Rate on application" lists.
6. If the project uses Vercel password protection for staging, exempt
   `/2027-charter-season` and `/2027-charter-season/yachts/*` (or disable it) before the
   public launch; the yacht pages are meant to be indexed and have canonical URLs.
7. Optional: review `design/itinerary-coverage.md`, edit the JSON, flip files to
   `"status": "approved"` as they are signed off, and re-run `npm run build:itineraries`
   locally or simply push (the build does it).

## Not done, and why

- **Real-data verification**: no passkey, Blob store or Vercel access here, so the fleet
  page, the facts step and the report ran against the demo fleet only. The code paths
  for the live document are exercised by the same functions, but the first Cron run on
  Vercel is the real test.
- **Non-Mediterranean day notes** are terse placeholders (see Phase 1). The routes and
  coordinates are real; the prose needs the editorial pass.
- **`general.data_source` in the report** shows "none" for real yachts, for the reason
  given above.
- The globe's coastline is the 50 m Natural Earth set: at the route zoom ceiling small
  islands read as simple polygons. It is legible and consistent with the design, but a
  10 m coastline for the Mediterranean would sharpen the close-ups if wanted.

## Demo report output (`/api/fleet/report`, this environment)

# Fleet page report

Source: demo. 6 yachts; facts updated 2026-09-09T14:33:51.148Z.

## Fleet-wide

| Length band | Yachts |
|---|---|
| Under 30m | 1 |
| 30 – 40m | 3 |
| 40 – 50m | 1 |
| 50m and above | 1 |
| Further yachts | 0 |

- No length ("Further yachts"): 0
- No weekly rate ("Rate on application"): 0
- Unavailable for the target season (not listed): 0
- Currencies: EUR 6
- Yachtfolio general.data_source: demo 6
- Normaliser "missing" flags: none 4, builder 2

(Per-destination table and gap list omitted here: 24 specific, 41 region, 60 none with the demo fleet. The live report carries the full table.)
