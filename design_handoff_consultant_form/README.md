# Handoff: Charter Portal — consultant form (populates the Tier 3 client page)

## Overview
The back-office form charter consultants use to build a client's Tier 3
"Yacht Selection" landing page (that page has its own handoff bundle,
`design_handoff_tier3_yacht_selection` — build against the same data model).
The consultant signs in to the Charter Portal, fills this form, and publishes;
the result is a unique client URL. Demo consultant is "Lucy".

## About the Design Files
`portal-form.html` is a **design reference built in HTML** — a working
prototype of the intended look and behaviour, not production code. Recreate
it in the real codebase (Next.js/React or the team's stack), with real
components, a form state layer, and the API integration described below.
`Canvas.dc.html` is the editable source it was compiled from (custom
component format; read it for exact values and interaction logic only).

## Fidelity
High-fidelity for layout, type and interaction patterns. The visual system is
the light/print-led counterpart of the dark client page: paper #FAFAF8
background, white #FFFFFF cards with 1px #E3E3E1 hairline borders (no radius,
no shadows), ink #1D1D1D, graphite #555759, grey #99999A, and all-caps
labels with print-grade tracking (9px/0.3em field labels, 11px/0.36em section
headers, 10px/0.3–0.4em buttons). Inputs: 1px #D8D8D6 border, 0 radius,
13px Gotham Light, focus = ink border. Fonts are licensed Gotham TTFs —
@font-face with Helvetica Neue fallback.

## Page structure
1. **Sticky header** (white, hairline bottom rule): black OI wordmark +
   "CHARTER PORTAL" label; right: "LUCY · LONDON" + 34px ink circle avatar.
   (Auth/login is out of scope for this build but the header should read
   from the session.)
2. **Intro**: eyebrow "NEW CLIENT PRESENTATION", display title "YACHT
   SELECTION" (Gotham Cond. Medium, clamp(28px,4vw,40px)/0.26em), one-line
   explainer.
3. **Section 01 — CLIENT & SEASON** (white card): client name(s), season,
   region, page headline. Auto-fit grid, minmax(240px,1fr).
4. **Section 02 — THE SELECTION** (white card): ordered, collapsible yacht
   entries (max 10; counter "N OF 10" top right; "+ ADD A YACHT" dashed
   button, disabled state at 10). Each entry: numbered header row with yacht
   name, REMOVE, +/− toggle; body is an auto-fit grid of fields — see
   Yachtfolio integration below for how they fill.
   Fields: yacht name (dropdown), length, year/refit, guests, staterooms,
   location, cruising area, availability, weekly rate EUR, APA %, consultant
   note (textarea, full width), lead image URL (full width), interior/deck/
   watertoys image URLs, brochure link.
5. **Section 03 — PAGE SECTIONS**: checkboxes for Costs involved, Suggested
   itinerary (+ itinerary URL field), Compare feature.
6. **Section 04 — YOUR DETAILS**: name, title, phone, email, WhatsApp,
   photo URL (prefill from the consultant's profile).
7. **Sticky publish bar** (fixed bottom, white, hairline top rule): status
   line left ("Draft — changes are saved as you type." / "Client page
   updated — the link is ready to send."); right: outlined "PREVIEW CLIENT
   PAGE" + solid ink "PUBLISH TO CLIENT PAGE" (→ "PUBLISHED ✓" confirmation
   state ~3s).

## Yachtfolio integration (replaces the prototype's mock fleet array)

The prototype fakes the fleet with a hard-coded array and fills sibling
inputs via DOM. Production requirements:

1. **Yacht name dropdown = all charter yachts currently in Yachtfolio**,
   each option showing yacht name + Yachtfolio ID (e.g. "M/Y SERENITY —
   YF-12345"). Searchable/type-ahead is desirable given fleet size.
2. **The dropdown list refreshes automatically — nightly is fine** — so
   additions and removals in Yachtfolio flow through with no config edits.
   Implement as a scheduled job (e.g. Vercel Cron) that pulls the charter
   fleet list from the Yachtfolio API into a cache/KV/database table the
   dropdown endpoint serves. Store name, Yachtfolio ID, and the minimal
   sort/search fields only.
3. **On selection, fetch that yacht's full details and images on demand**
   (server-side route hit at pick time) — do NOT pre-fetch or pre-build
   images for the whole fleet. Response populates: length, year/refit,
   guests, staterooms, location, cruising area, availability, weekly rate,
   image URLs, brochure link. All fields stay editable — the fetched values
   are a starting point the consultant may override per client.
4. **The Yachtfolio passkey/credentials must never reach the browser.** All
   Yachtfolio calls happen server-side (API routes / server actions), the
   key living in server-only env vars. The client talks only to the app's
   own endpoints: `GET /api/fleet` (cached nightly list) and
   `GET /api/fleet/:yfId` (on-demand detail proxy). Rate-limit and
   auth-gate both behind the consultant session.
5. Yacht images should conform to the 16:10 / 2000×1250 geometry the client
   page requires; if Yachtfolio serves other ratios, request the closest
   crop via its image API rather than distorting.

## Data model (shared with the Tier 3 page)
Page: { clientNames, season, region, headline, yachts[≤10], sections:
{ costs, itinerary (+itineraryUrl), compare }, consultant: { name, title,
phone, email, whatsapp, photoUrl } }
Yacht: { yfId, name, lengthM, yearRefit, guests, staterooms, location,
cruisingArea, availability, weeklyRateEUR, apaPct (default 35), notes,
leadImageUrl, interiorImageUrl, deckImageUrl, watertoysImageUrl, brochureUrl }

## Behaviour notes
- Draft autosave as the consultant types (the status line already promises
  it); publish writes the versioned page config the Tier 3 renderer reads.
- PREVIEW CLIENT PAGE opens the rendered Tier 3 page for the current draft
  (`/yacht-selection/` in the prototype; per-client slug in production).
- Yacht entries are ordered — order defines the ring carousel order.
  (Prototype lacks drag-reorder; adding it is welcome.)
- REMOVE deletes an entry without confirmation in the prototype; a soft
  confirm is acceptable.

## Files
- `portal-form.html` — compiled, self-contained reference (open in browser).
- `Canvas.dc.html` — editable source (custom DC format: template + logic
  class). Mock fleet array and auto-fill logic live in the logic class.
- `assets/logo-black.png` — OI wordmark for the header.
