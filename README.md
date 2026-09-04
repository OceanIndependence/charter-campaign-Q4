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
