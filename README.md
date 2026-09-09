# Ocean Independence — Charter Campaign demos

Static export of the four campaign designs. No build step — every page is a
self-contained HTML file; the shared `assets/` folder serves the runtime
(demo) imagery.

## Structure / slugs

| Slug | Page |
|---|---|
| `/` | Index linking the four demos |
| `/atlas/` | Tier 1 — The 2027 Atlas (interactive globe) |
| `/personalised-atlas/` | Tier 2 — Personalised Atlas (Harrington) |
| `/yacht-selection/` | Tier 3 — Yacht Selection (3D ring carousel) |
| `/portal/` | Charter Portal — consultant form |

## Deploy on Vercel

1. Push this folder to a GitHub repository (the folder contents at the repo
   root, so `index.html` sits at the top level).
2. In Vercel: **Add New → Project**, import the repository.
3. Framework preset: **Other**. Build command: none. Output directory: leave
   as the repo root (`.`).
4. Deploy — the slugs above map to the folders automatically.

Notes
- Pages are large (up to ~7 MB) because all fonts and demo imagery are
  inlined for reliability; swap demo images for CDN-hosted Sirv URLs in
  production.
- The cross-page links (e.g. Yacht Selection → itinerary) use the absolute
  slugs above, so keep the folder names as they are.

## Tier 3 production app (`selection-app/`)

`selection-app/` is the production rebuild of the Tier 3 Yacht Selection page
as a Next.js (App Router) + TypeScript app, recreated from the design handoff
in `design_handoff_tier3_yacht_selection/` (see its README for the full spec).
Client pages are served at `/selection/[slug]`, driven by one typed
`PageConfig` object per client (demo config included; swap
`getPageConfig()` in `src/lib/demo-config.ts` for the Charter Portal API).
Deploy it on Vercel as its own project with **Root Directory** set to
`selection-app` — see the app's own structure for details.

## Tier 1 production page (`selection-app/` → `/2027-charter-season`)

The 2027 Atlas is a public page in the same Next.js app: an interactive
WebGL globe (three.js) of every Ocean Independence charter destination with a
destination panel beside it (below it on phones). It is recreated from the
Tier 1 design reference (the `/atlas/` demo bundle carries the DC source and
the `atlas-globe-3d.js` prototype engine, ported to
`selection-app/src/lib/atlas/globe.ts`).

Content is build-time: `selection-app/data/destinations.json` is a checked-in
snapshot crawled from https://www.oceanindependence.com/yacht-charter/destinations/
(every region, country, cruising ground and place beneath it — name, URL,
intro copy verbatim, hero image, key facts, child destinations and the
featured charter yachts with specs, rate and Sirv lead image). Refresh it with

```
cd selection-app
npm run import:destinations
```

The script geocodes every destination automatically (the page's own map pin,
checked against the design source's hand-placed pins, then a Nominatim
fallback) and prints the low-confidence coordinates for review; resolve any of
them in `selection-app/data/destination-overrides.json` and re-run. Commit the
regenerated JSON.

ENQUIRE links out to the website's enquiry form; the page carries meta tags
only (title, description, Open Graph image, canonical) and no analytics.

### Itineraries

Each destination panel offers a five-day and a seven-day suggested itinerary;
choosing one draws the route on the globe (camera eased to the route, numbered
day markers, the day list following as you scroll). The routes live in the
repo, one file per destination:

```
selection-app/content/itineraries/<destination id with / → -->.json
{ "destinationId": "mediterranean/italy/amalfi-coast",
  "status": "placeholder" | "approved",          # internal, never rendered
  "itineraries": [ { "id", "nights", "title", "intro",
                     "days": [ { "day", "place", "lat", "lng", "note" } ] } ] }
```

Coordinates are authored in the files; nothing is geocoded at build or run
time. `npm run build:itineraries` (also the `prebuild` step) validates them,
writes `selection-app/data/itineraries.json` for the page and
`design/itinerary-coverage.md` for editorial review. The website sync also
captures the itinerary pages linked from each destination
(`itineraryLinks` and `itineraries` in the snapshot) and the panel links to
them.

### Public fleet page (`/2027-charter-season/yachts/<destination id>`)

"View yachts for charter in …" on a destination panel opens a public listing
of the yachts whose Yachtfolio cruising area covers that destination, grouped
into length bands (Under 30m, 30 – 40m, 40 – 50m, 50m and above, then
"Further yachts" for yachts with no length), each with "From EUR 250,000 per
week plus 35% APA plus VAT" from the weekly rate minimum in the yacht's own
currency (or "Rate on application"). The APA percentage is the Tier 3
default (`DEFAULT_APA_PCT` in `src/lib/portal-types.ts`); no amounts or
totals are shown. Cards open the Tier 3 detail drawer.

The page is server-rendered from a fleet-wide facts document that the nightly
Cron (`/api/cron/fleet-sync`) builds after the fleet list, one basic record
per yacht within a time budget, so a fresh deployment fills it over the
first few runs. Without `YACHTFOLIO_PASSKEY` or before the first run the
six-yacht demo fleet is served and the fallback is logged.
`GET /api/fleet/report` (send the Cron bearer token, `Authorization: Bearer
$CRON_SECRET`) returns a Markdown report of the mapping coverage, band
distribution and data gaps the page will show from the current facts.


## Tier 2 production page (`selection-app/` → `/atlas/<slug>`)

The Personalised Atlas is the 2027 Atlas for one client: the consultant chooses three
destinations and a shortlist of two to eight yachts in the Charter Portal (choose
"Personalised Atlas" when creating a new selection); the client gets the globe with
those three pinned bright, every other destination dimmed but clickable, a yacht rail
and a Tier 3-style detail drawer. It composes the Tier 1 globe and content pipeline
with the Tier 3 Yachtfolio, image, publishing and auth modules; nothing is duplicated.

- Destination copy and imagery arrive from the Atlas when a destination is chosen
  (live from the website where it answers, else the checked-in snapshot); each block
  records whether it is Atlas text or the consultant's edit, and the page labels it.
- Published pages freeze destination content, pins and yacht data at publish time.
- Without `YACHTFOLIO_PASSKEY` the fleet is served from a six-yacht demo set, and
  `/atlas/harrington-summer-2027` renders the demo page (`DEMO_PAGES=false` disables it).

See `selection-app/docs/tier2-build-report.md` for the modules reused, the globe API
adaptations, the destination ids and a sample page config.
