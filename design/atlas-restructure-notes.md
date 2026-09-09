# Atlas restructure — Phase 0 notes

Written 09 September 2026 on branch `claude/atlas-restructure-itineraries-fleet`
(off `main` at `36bbcab`, the merge of the Tier 2 Personalised Atlas). Nothing below
was changed before these notes were written; where the brief's description of the
current code differs from what is in the repository, the difference is called out.

## 1. Destination content module

| Concern | Where | Notes |
|---|---|---|
| Snapshot (the content the Atlas renders) | `selection-app/data/destinations.json` | Written by `npm run import:destinations`. 125 destinations, 417 yachts (deduplicated across pages), a `review` list of low-confidence coordinates, `errors`. Loaded on the client as a lazy chunk (`AtlasPage.tsx` → `loadSnapshot()`); read on the server by `src/server/atlas/content.ts` for Tier 2. |
| Crawler | `selection-app/scripts/import-destinations.mjs` | Crawls `oceanindependence.com/yacht-charter/destinations/` and every page beneath it, geocodes (site map pin → design reference pins → children centroid → Nominatim → parent), writes the snapshot. Manual overrides in `data/destination-overrides.json`. |
| Page parser | `selection-app/src/server/atlas/website.mjs` | Extracted from the crawler for Tier 2; `parsePage(url, html)` returns name, meta, hero, lede, paragraphs, key facts, map pins, child destination cards, links and yacht cards. **No itinerary capture yet** — the destination pages carry an `#itineraries` section (a single "Charter Itinerary — <title>" feature on country pages, a card slider on the Mediterranean page) linking to `/yacht-charter/itineraries/<region>/<slug>/`, and those itinerary pages carry a day-by-day narrative (`DAY TO DAY ITINERARY`, one `h3` per day such as "Day One rome") plus a Google map with the route's endpoints. |
| Types | `selection-app/src/lib/atlas/types.ts` | `AtlasDestination` (id, slug, name, url, level 1–4, parentId, regionId, lat/lon, geo, heroImage, cardImage, summary, lede, paragraphs, keyFacts, childIds, yachtIds, featured), `AtlasYacht`, `AtlasSnapshot`. |
| Helpers | `selection-app/src/lib/atlas/data.ts` | `buildIndex`, `children`, `parentOf`, `regionOf`, `descendants`, `topLevelPins`, `subPinsFor`, `zoomFor`, `placesLine`, `eyebrowFor`, `shortIntro`, `sirv`, `POPULAR_IDS`, `RESTING_LABEL_IDS`. |
| Ids and hierarchy | ids are the website path under `/yacht-charter/destinations/` — `mediterranean/italy/amalfi-coast`. Level 1 regions (13), level 2 countries/areas, level 3 cruising grounds, level 4 places. Slugs alone are **not unique**: `antarctica` (region and its child) and `the-great-barrier-reef` (under `australasia/` and `australia-and-new-zealand/`). Itinerary files are therefore keyed by full id with `/` → `--` in the filename (`mediterranean--italy--amalfi-coast.json`), and `destinationId` inside the file is the full id. |
| Live refresh (Tier 2) | `src/server/atlas/content.ts` → `resolveDestination()` | Re-reads one page with `parsePage`, falls back to the snapshot and logs `content served from the cached Atlas snapshot`. This is the "website fetch fails → last cached content" path the brief asks for; the Tier 1 page itself only ever reads the snapshot. |

## 2. Globe component

| Item | Where |
|---|---|
| Engine | `selection-app/src/lib/atlas/globe.ts` — class `AtlasGlobe(host, cfg)` (three.js, d3-geo, topojson-client; land from `public/atlas/countries-{110,50}m.json`). |
| Wrapper | `selection-app/src/components/atlas/AtlasGlobe.tsx` — lazy-imports the engine, replays calls made before it is ready, exposes `GlobeHandle`. |
| API | `setPins(pins)`, `setSubPins(pins)`, `setFocus(ids | null)` (dims and greyscales every other pin), `setSelected(id)`, `setOptions({ drift, graticule, lockDrag, lockZoom })`, `flyTo(lat, lon, zoom, dur)`, `zoomBy(factor)`, `reset()`, callbacks `onPinSelect(id)`, `onDeselect()`. Pins: `{ id, name, lat, lon, featured, priority }`. |
| Selection | `AtlasPage.tsx` → `select(id)`: sub-pins for the children, `setFocus`, `setSelected`, `flyTo(dest.lat, dest.lon, zoomFor(dest))`. An empty-ocean tap fires `onDeselect`. |
| Camera | Yaw/pitch/zoom state; telephoto zoom (fixed camera distance, FOV narrows) so `zoom` maps to a pixel radius. No "fit bounds" yet — `flyTo` takes a centre and a zoom. |
| Layers | Pins are DOM elements positioned each frame from projected 3D anchors (labels, stems, dots, four-way label placement, collision culling). **There is no polyline, arc or point layer.** Adding a route layer means: a `THREE.Line` (or tube) through great-circle-interpolated points on a slightly raised sphere, plus numbered DOM markers using the same anchor/projection path as pins. |

## 3. Destination panel

`selection-app/src/components/atlas/AtlasPanel.tsx`. **There are no tabs.** The panel is
already a single scrolling column: back link, eyebrow, name, places line, hero, two-sentence
intro with "Read the full guide", child destination cards ("Cruising grounds"), then a
"FEATURED YACHTS" section (up to eight `YachtCard`s from the snapshot's `yachtIds`, a "View
more yachts in X" link to the website), key facts, the yacht-selection note and ENQUIRE.
The restructure removes the yacht section and note, adds the itinerary block and the
"View yachts for charter in X" button.

## 4. Fleet cache and the normalised yacht record

| Item | Where | Detail |
|---|---|---|
| Nightly Cron | `vercel.json` (`0 3 * * *`) → `src/app/api/cron/fleet-sync/route.ts` → `syncFleet()` in `src/server/fleet.mjs` | Writes `yachtfolio/fleet.json` (`{ syncedAt, count, yachts: [{ id, name, registryPort }], removed }`) and `yachtfolio/reference.json` (seasons, operating areas, equipments) to the private DATA Blob store, hash-guarded via `private/fleet-manifest.json`. |
| Per-yacht facts | `getYachtDetail(yfId)` in `fleet.mjs` → `yachtfolio/details/<id>.json` | Fetched **on demand** when a consultant picks a yacht, cached six hours. **The nightly cache holds names only — no length, rate, currency or areas for the whole fleet.** A public listing needs a fleet-wide facts document, which the Cron does not produce today. |
| Normalised record | `extractYachtFacts()` in `src/server/yachtfolio/normalise.mjs`; shape `FleetDetail` in `src/lib/portal-types.ts` | `name`, `lengthM`, `yearRefit`, `guests`, `crew`, `builder`, `staterooms` (string), `cruisingArea`, `currency`, `weeklyRate`, `weeklyRateIsFrom`, `rateOptions`, `description`, `keyFeatures`, `dataSource`, `missing`, `warnings`. |
| Length overall | `lengthM` ← `specifications.length_metres`, else the data-source block's `length`, else `basic.length_metric` (`parseMetres`). | |
| Weekly rate min / max | `weeklyRate` ← `min_rate` of the target season's price row (`brochure.prices[seasonId][0]` or `basic.rates[season]`); `weeklyRateIsFrom` is true when `max_rate` differs. `rateOptions.summer.low/high` carry min and max for summer 2027, `rateOptions.winter` likewise. | |
| Currency | `currency` ← the price row's `currency`, upper-cased, default `EUR`; never converted. | |
| Operating areas | `cruisingArea` ← area ids from `brochure.operating_areas[seasonId]`, else `basic.operating_areas_new[].areas` for the season, resolved to names through `reference.operating_areas.areas` (`type=operating_areas_new`), joined with ", " and upper-cased. Only the names survive normalisation; the ids do not. | |
| `general.data_source` | `specBlocks()` picks `auto` / `manual` / `manual_text` by the value; `checkBrochureShape()` flags any other value. Live values seen: `auto`, `manual`, `text`. | |
| Images | `getYachtImages(yfId)` → gallery through `cropToSizes` (sharp, 2000 × 1250 and 1000 × 625) into the public IMAGES store, manifest-tracked; media URLs from Yachtfolio embed the passkey and are stripped before storage. On demand only. | |
| Demo fallback | `src/server/demo/fleet.mjs` — `isDemoFleet()` is true when `YACHTFOLIO_PASSKEY` is absent; `demoFleet()`, `demoDetail()`, `demoImages()` mirror the service shapes with six demo yachts. | |

## 5. APA default and per-yacht override (Tier 3)

- Default: `emptyDraftYacht()` in `src/lib/portal-types.ts` sets `apaPct: "35"`; Tier 2 uses
  `TIER2_DEFAULT_APA = "35"` from the same file. The Tier 3 form's field placeholder is also
  "35" (`PortalForm.tsx`).
- Per-yacht override: the consultant edits `DraftYacht.apaPct` (a string) in the draft;
  `mapDraftYacht()` in `src/lib/portal-map.ts` freezes it at publish as `apaPct` and computes
  `apaAmount` and `totalAmount` into the page config. Drafts and published configs live in the
  private DATA store (`src/server/pages.mjs`).
- The fleet page must read the default from `portal-types.ts` and never touch drafts. To avoid
  two "35"s drifting apart, the restructure introduces a single `DEFAULT_APA_PCT` constant that
  `emptyDraftYacht`, `TIER2_DEFAULT_APA` and the fleet page all derive from.

## 6. Cruising-area → destination mapping (Tier 2)

- Terms: `areaTermsFor(dest, index)` in `src/server/atlas/content.ts` — the destination's own
  name, its children's names, its ancestors up to country level (all lower-cased, leading
  "the" dropped), plus `region:<region name>`. Delivered to the form as `areaTerms`.
- Matching: `mapCruisingArea(cruisingArea, destinations)` in
  `src/components/portal/Tier2Form.tsx` — word-boundary match of each term against the
  yacht's upper-cased `cruisingArea` string; specific hits win, otherwise region hits.
- Reusable as-is in logic, **not in location**: it is exported from a client component file
  and typed against `Tier2DestinationDraft`. The restructure lifts the matcher into
  `src/lib/area-match.ts` with a plain `{ id, areaTerms }` input, and the Tier 2 form calls
  the lifted function (same behaviour, no signature change to the form).
- Gap: only names survive normalisation, so the mapping is textual. Yachtfolio area names
  such as "WEST MEDITERRANEAN" only match region terms; a yacht listing only
  "MEDITERRANEAN" matches every Mediterranean destination through the region fallback.

## 7. Tier 3 yacht card and detail drawer

- Card: **there is no standalone card component.** The card is rendered inline inside
  `src/components/RingCarousel.tsx` (the `.card` wrapper carries the ring's 3D transform and
  depth filters; the `.cardBody` inner block is the visible card: 16:10 lead image with name
  scrim, stat row GUESTS / STATEROOMS / LENGTH, `fmtCardRate()` price, cruising area, mint
  dash). Styles in `RingCarousel.module.css`. The restructure extracts the inner block into
  `src/components/YachtCardBody.tsx`, used unchanged by `RingCarousel` and by the fleet page.
- Detail drawer: `src/components/SpecPanel.tsx` (props `yacht: Yacht`, `position`, `count`,
  `fading`, `onPrev`, `onNext`, optional `signedBy`, `vatText`) is the detail anatomy; Tier 3
  renders it inline under the ring, Tier 2 wraps it in a right-hand drawer
  (`PersonalisedAtlasPage.tsx`, `.drawerScrim` / `.drawer` / `.drawerClose` in
  `Personalised.module.css`). The price block renders WEEKLY RATE, VAT, APA amount and TOTAL
  when those fields exist on the yacht; passing a yacht with no `apaAmount`, `vatAmount` or
  `totalAmount` suppresses those rows. A `rateLine` prop is added so the fleet page can show
  the "from" formulation in place of the breakdown.
- Tier 2 rail card: `PersonalisedAtlasPage.tsx` has its own rail card (name, meta, rate, chips).
  Untouched.

## 8. What the brief assumed that is not so

- No "two tabs" in the Tier 1 panel; yachts are a section in one scrolling column.
- The nightly Cron caches only the fleet list. Length, rate, currency and operating areas
  exist per yacht only after an on-demand detail fetch. The fleet page therefore needs a new
  fleet-wide facts cache, built by the same Cron (see the report).
- No `content/` directory and no `design/` directory existed; both are created here.
- Yachts in `data/destinations.json` come from the website's "Yachts in the Area" cards, not
  from Yachtfolio; they are not used by the fleet page.
