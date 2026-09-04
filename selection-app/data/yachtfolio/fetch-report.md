# Yachtfolio fetch report

No report has been generated in this checkout. This file is written by
`npm run yachts:fetch` (optionally with yacht ids: `npm run yachts:fetch --
12683`), a diagnostic CLI over the same fleet services the Charter Portal
uses at runtime — nightly cron sync (`/api/cron/fleet-sync`) plus on-demand
per-yacht detail (`/api/fleet/:yfId`).

It records the fleet count, yachts that have disappeared from Yachtfolio
since earlier syncs, per-yacht field and image diagnostics, a live-shape
check against the v1.2 API documentation, and saves a passkey-redacted
brochure sample to `data/yachtfolio/samples/`.
