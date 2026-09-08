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

