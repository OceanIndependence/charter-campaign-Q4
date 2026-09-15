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


## Tier 2 production page (`selection-app/` → `/atlas/<slug>`)

The Personalised Atlas is the 2027 Atlas for one client: the consultant chooses three
destinations and a shortlist of two to 10 yachts in the Charter Portal (choose
"Personalised Atlas" when creating a new selection); the client gets the globe with
those three pinned bright, every other destination dimmed but clickable, a yacht rail
and a Tier 3-style detail drawer. It composes the Tier 1 globe and content pipeline
with the Tier 3 Yachtfolio, image, publishing and auth modules; nothing is duplicated.

- Destination copy and imagery arrive from the Atlas when a destination is chosen
  (live from the website where it answers, else the checked-in snapshot); each block
  records whether it is Atlas text or the consultant's edit, and the page labels it.
- Published pages freeze destination content, pins and yacht data at publish time.
- The form's PAGE SECTIONS card is the Tier 3 one: a dark or light theme, the
  collapsible "Costs involved" explainer, a suggested itinerary with up to three
  links (each with its own button text) and the compare feature (a toggle on each
  rail card, up to three yachts side by side). Every section is on for a new
  selection; pages published before the card existed carry none. On the light
  theme the header and the foot stay dark, as on the Yacht Selection page.
- Without `YACHTFOLIO_PASSKEY` the fleet is served from a six-yacht demo set, and
  `/atlas/harrington-summer-2027` renders the demo page (`DEMO_PAGES=false` disables it).

See `selection-app/docs/tier2-build-report.md` for the modules reused, the globe API
adaptations, the destination ids and a sample page config.


## Consultant profiles (`selection-app/`)

Consultants are records at `consultants/<id>.json` in the private DATA store
(same pattern as the per-yacht records), with a summary index at
`consultants/index.json` for look-ups by email or Entra object ID. The
initial set comes from `data/consultants-seed.csv`, the editable source in
the repo. A build step (`prebuild`, also `npm run consultants:seed:build`)
compiles it into the committed module `src/data/consultants-seed.ts`, so the
deployed app never reads the CSV from disk. Edit the CSV, regenerate, commit
both.

The import runs inside the deployed app: `/portal/admin/import-consultants`
has one button, guarded server-side by `PORTAL_ACCESS_KEY` (closed when the
key is unset; to move behind `PORTAL_ADMIN_EMAILS` once Microsoft sign-in
lands). It writes to the same Blob store the app already uses and shows how
many records were created, how many rows were skipped, and which photos did
not resolve. It skips any email that already has a record, never updates or
deletes, and is safe to press again. `npm run consultants:import` is a local
test harness that calls the same function.

On each portal request the signed-in identity is resolved to its record in
`src/server/consultant-session.ts`: matched on Entra object ID, then on
email (which claims an unclaimed record), else created with `source: "sso"`
from the token claims. Claims never overwrite a stored value. Consultants
edit only their phone and WhatsApp numbers, at `/portal/profile`; with
`CONSULTANT_SCOPING=on` the dashboard redirects there until a phone number is
filled in (off by default, like scoping, until real sign-in). Everything
else on the record belongs to the admin screen.

A selection belongs to one consultant record, chosen from a picker when it
is created and never reassigned. Selections are stored under that record
(`portal/selections/<consultantId>/…`), so a consultant's dashboard and every
selection route CAN be scoped structurally — behind the `CONSULTANT_SCOPING`
flag, which is OFF by default until Microsoft sign-in lands. While off, every
signed-in user sees every selection, no route checks ownership, selections
are found by id through `portal/selection-locations.json`, and a selection
with no consultant publishes with the block frozen in its draft. Set
`CONSULTANT_SCOPING=on` to enable scoping. Client pages resolve the consultant
live: every render of `/selection/<slug>` or `/atlas/<slug>` reads the
current record (`src/server/consultant-render.ts`). An inactive consultant's
page carries no contact block at all. Publishing is blocked while the
selection's consultant has no phone number. The import page also carries a
one-off CLEAR CONSULTANT FROM ALL SELECTIONS action, which removes the
consultant from every existing selection and its published page (undoing an
earlier fixture attachment); the attach action remains as code only. See `docs/consultant-profiles-report.md` and
`docs/consultant-pages-phase3-report.md`.

Microsoft sign-in (`PORTAL_AUTH_PROVIDER=microsoft`, with
`AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` and
`PORTAL_SESSION_SECRET`): OpenID Connect with PKCE in
`src/server/auth/microsoft.ts`, routes `/api/auth/microsoft` and
`/api/auth/microsoft/callback` (register
`https://<host>/api/auth/microsoft/callback` on the app for every host).
Only people with a consultant record may sign in; the record is matched on
object ID, then email. Under Microsoft the access key is not asked for, and
consultant scoping and the profile gate default to on. See
`selection-app/docs/microsoft-sign-in-report.md`.

Admin: `PORTAL_ADMIN_EMAILS` (comma-separated, compared lowercase against
the signed-in email, in `src/server/auth/index.ts` only) opens
`/portal/admin/consultants` and the `/api/admin/consultants` routes, guarded
server-side. Admins edit display name, job title, email, photo URL (HEAD
re-checked on change) and status, add a consultant ahead of their first
sign-in, and release a record for re-claiming; never phone or WhatsApp,
never deletion. Every change stamps `updatedAt` and `updatedBy`.

## Storage and imagery (`selection-app/`)

The portal keeps two stores, deliberately separate:

- **Private Blob for JSON** — drafts, versioned published page configs,
  the fleet list and reference data, the fleet-level state
  (`private/fleet-state.json`), one record per picked yacht at
  `yachts/<yfId>.json` (specifications with a hash and fetch time, picker
  facts, the prepared images in display order) and the in-use index at
  `selections/in-use.json` (`{ "<yfId>": ["<selectionId>", …] }`), which is
  how the nightly refresh knows which yachts anyone is using. Only yachts a
  consultant has picked, or that appear in a selection, ever have a record
  or images prepared; the picker facts (builder, length, base port) for the
  rest are read once from the brochure, in bounded batches, into
  `fleet.json`. Nothing loops over the whole fleet in one go.
- **Sirv for imagery** (`IMAGE_STORE=sirv`) — one untouched original per
  gallery image at `/yachtfolio_images/<yfId>/<yfId>.<pos>.<ext>`, cropped
  at request time by the `charter-hero` (2000 × 1250) and `charter-thumb`
  (1000 × 625) profiles. Each yacht has its own subfolder; the filename
  repeats the yacht id so it matches the convention of the CRM images
  already in the same Sirv folder. Position 0 is the main image. The
  earlier public Blob IMAGES store still serves pages published before the
  switch (`IMAGE_STORE=blob` keeps that pipeline).

Specs are frozen at publish; images are live: a published page shows the
specifications, rate and notes as published and the yacht's current photos.
See `selection-app/docs/sirv-image-pipeline-build.md`.
