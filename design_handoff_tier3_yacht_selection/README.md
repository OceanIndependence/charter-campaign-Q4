# Handoff: Tier 3 — Yacht Selection (client-specific landing page)

## Overview
A personalised, mobile-first landing page a charter consultant sends a client
by email. It presents up to 10 shortlisted charter yachts on a **3D ring
carousel**, with a specification panel, collapsible costs/itinerary sections,
a side-by-side compare feature, and the consultant's contact block. Built for
Ocean Independence (OI); demo client is "Mr and Mrs Harrington", consultant
"Lucy".

## About the Design Files
The files in this bundle are **design references created in HTML** — working
prototypes showing intended look and behaviour, not production code to copy
directly. The task is to **recreate this design in your codebase's existing
environment** (React/Next.js or whatever the team uses) with its established
patterns — or, if greenfield, pick an appropriate framework (a Next.js app
deployed on Vercel fits the intended hosting). The prototype's inline styles
and vanilla-JS-style logic should become real components, a design-token
layer, and typed data models.

`tier3-yacht-selection.html` is the primary reference (self-contained,
open in a browser). `Tier 3 - Client Specific.dc.html` is the editable
source it was compiled from (custom component format; read it for logic, not
for framework patterns).

## Fidelity
**High-fidelity.** Colours, typography, tracking, spacing and interactions
are final and follow the OI brand system. Recreate pixel-perfectly.

## Data model (populated by the Charter Portal — see Backend notes)
Yacht: { id, name, tagline?, lengthM, yearRefit, guests, staterooms (count +
breakdown string), location, cruisingArea, availability, weeklyRateEUR,
apaPct (35 default), notes (consultant's personal note), leadImageUrl,
interiorImageUrl, deckImageUrl, watertoysImageUrl, brochureUrl }
Page: { clientNames, season, region, headline, yachts[≤10], sections:
{ costs, itinerary (+itineraryUrl), compare }, consultant: { name, title,
phone, email, whatsapp, photoUrl } }

**Image geometry (fixed):** every yacht image is 16:10, source 2000×1250 px.
Never crop or stretch to another ratio.

## Screens / Sections (single scrolling page, top to bottom)

### 1. Cover
- Black screen (#04080A with a very subtle radial lift: `radial-gradient(ellipse 120% 80% at 50% 30%, #0A1214 0%, #04080A 60%)`), no imagery.
- Header bar (72px, hairline bottom rule rgba(255,255,255,0.1)): white OI wordmark left (28px tall), right label "SUMMER 2027 · MEDITERRANEAN" 10px / tracking 0.36em / weight 500 / rgba(255,255,255,0.6).
- Centred: mint eyebrow "10 YACHTS, HELD FOR YOUR REVIEW" (10px, 0.36em, #A7E6D7), headline "YACHT CHARTER SELECTION" (Gotham Condensed Bold, clamp(28px, 4.4vw, 48px), 0.28em tracking), subline "Prepared for Mr and Mrs Harrington by Lucy — Summer 2027, Mediterranean" (13px, 0.08em, rgba(255,255,255,0.7)).

### 2. 3D Ring Carousel (the centrepiece)
- **Geometry:** N cards on an invisible cylinder: each card `rotateY(i × 360/N) translateZ(R)`; the ring's parent gets `translateY(−R·sin(tilt)·0.9) translateZ(−(R − 0.12·cardW)) rotateX(−tilt) rotateY(−idx × 360/N)`. Stage `perspective: 1500px; perspective-origin: 50% 40%`. Defaults: cardW = min(420px, 68vw), R = 1.95 × cardW, tilt 3°.
- **Transition:** 1100ms `cubic-bezier(0.16, 1, 0.3, 1)` on the ring transform — settles like a turntable, one card per swipe.
- **Card:** glass panel — border-radius 16px, 1px border rgba(167,230,215,0.55), background `linear-gradient(180deg, rgba(167,230,215,0.07), rgba(255,255,255,0.02) 55%, rgba(167,230,215,0.04))`, glow `box-shadow: 0 0 18px rgba(167,230,215,0.28), 0 0 60px rgba(167,230,215,0.14), inset 0 0 24px rgba(167,230,215,0.08), 0 30px 60px rgba(0,0,0,0.55)`. Height ≈ 1.3 × width.
- Card content: 16:10 lead image at the top edge; yacht name on the image over a bottom scrim (`linear-gradient(to top, rgba(4,8,10,0.88), rgba(4,8,10,0.4) 55%, transparent)`, name 15px / 0.28em / 500, centred); stat row of three columns (thin-line 19px icons + 15px number + 7.5px/0.3em label) for GUESTS / STATEROOMS / LENGTH; "FROM EUR X" (11.5px, mint) + "CRUISING AREA · X" (8.5px/0.28em, rgba(255,255,255,0.5)); 26×3px mint dash (active card) at the foot.
- Depth treatment: active card opacity 1, filter none; ±1 neighbours 0.8 / brightness(0.65); ±2 0.55 / brightness(0.55); far side 0.3 / blur(3px) brightness(0.45).
- Compare button top-right of each near card (34px square, + icon → mint check when selected; see Compare).
- **Navigation:** touch swipe (55px threshold, horizontal-dominant), mouse drag (70px), horizontal wheel, arrow keys, side chevrons, and progress dots (22×2px bars, mint = active). Progress caption above: "N OF 10 — NAME" (9.5px/0.4em).
- Clicking the front card smooth-scrolls to the spec panel; clicking a side card rotates to it.
- **Sound:** toggle bottom-right ("SOUND OFF/ON", 8.5px/0.34em; speaker icon), off by default, state not persisted. On change plays a ~0.6s noise "swoosh" through a bandpass filter sweeping 600→3200→900 Hz (Web Audio, gain peak 0.09). Never autoplay.

### 3. Specification panel (below the ring, max-width 680px, centred)
- Header row: "NN OF 10" (9px/0.36em/rgba(255,255,255,0.4)) + two 36px square hairline prev/next buttons (hover: mint border + rgba(167,230,215,0.06) fill).
- Yacht name (Gotham Condensed Medium, clamp(26px,3vw,34px), 0.24em).
- Three 16:10 thumbnails (interior / deck / watertoys), 8px gap.
- Spec rows, hairline-ruled (rgba(255,255,255,0.1)): LENGTH, YEAR / REFIT, GUESTS, STATEROOMS, LOCATION, AVAILABILITY — label 9.5px/0.3em/rgba(255,255,255,0.45), value 12.5px right-aligned.
- Price block: WEEKLY RATE, VAT ("TBC"), APA (35%), then a mint-ruled TOTAL row (mint labels/values, total value 14px/500).
- Consultant note: 12.5px, rgba(255,255,255,0.65), left mint hairline border, signed "— Lucy".
- "VIEW BROCHURE" link: 10px/0.3em, 2px mint underline with 7px gap.
- Panel cross-fades (opacity, 340ms) while the ring turns; content swaps at ~480ms.

### 4. Compare (feature-flagged per page)
- Selecting via card + buttons (max 3; further taps ignored until one is unticked).
- Fixed bottom bar (#0B0E10, mint hairline border): selected names (9px/0.3em, ellipsis on overflow) · "COMPARE" (mint underlined; disabled grey below 2 picks) · ×.
- Full-screen overlay (rgba(4,8,10,0.97)): "COMPARE" header with ×, then a grid — label column (minmax(86px,130px)) + one column per yacht (150px min each, horizontal scroll on small screens). Rows: the six spec rows + WEEKLY RATE, APA (35%), TOTAL. Hairline row rules.

### 5. Disclaimer + collapsible sections
- "COSTS INVOLVED" and "YOUR ITINERARY": centred header (Gotham Cond. Medium 22px/0.28em) with +/− toggle, collapsed by default, hairline top rules.
- Costs content: image left (swim-platform photo) + five mint-labelled entries (CHARTER FEE, APA, DELIVERY FEE, VAT, CREW GRATUITY) — exact copy in the prototype.
- Itinerary content: intro line + "VIEW YOUR SUGGESTED ITINERARY" link → the Tier 2 personalised atlas page.
- Disclaimer ("These vessels are offered subject to change…") sits above the footer.

### 6. Consultant block + footer
- Circular consultant photo (128px), name (14px/0.3em), title line, phone + email rows with 14px thin-line mint icons, "WHATSAPP ME" outlined button (11px/0.36em; hover inverts to white fill/black text) → wa.me link, "EXPLORE ALL 2027 DESTINATIONS →" link → Tier 1 atlas.
- Footer: white wordmark (16px, 0.7 opacity) + "SHAPING THE FUTURE OF YACHTING" (9px/0.3em).

## Interactions & Behaviour summary
- Ring rotation state = single integer index (unbounded, mod N for display) so the ring always turns the short way; dots/labels use mod.
- Mobile first (opened from email): page must never scroll horizontally (clip the ring overflow), card 68vw, all touch targets ≥ 34px, compare table scrolls horizontally inside the overlay.
- Restrained motion only; no bounces or parallax. Page transitions/crossfades 240–480ms.

## Design tokens
- Ink/backgrounds: page #04080A (radial lift to #0A1214), panels #0B0E10.
- Mint accent #A7E6D7 (the ONLY chromatic accent; used for glow, prices, active states, TOTAL row).
- White text at opacities: 1 / 0.8 / 0.7 / 0.65 / 0.6 / 0.5 / 0.45 / 0.4 / 0.35.
- Hairlines: rgba(255,255,255,0.1–0.2); mint hairlines rgba(167,230,215,0.4–0.55).
- Type: Gotham Light (body), Gotham Medium (labels/all-caps), Gotham Condensed Medium/Bold (display). All-caps runs use print-grade tracking: 0.24–0.4em (the smaller the text, the wider). Fonts are licensed TTFs — ship via @font-face in the real app.
- Radii: 16px on ring cards only (a deliberate exception); everything else 0.
- Icons: thin 1px-stroke line icons only (custom SVGs in the prototype). No emoji, no icon fonts.

## Backend notes (from the product brief)
- This page is generated per client by consultants through a Charter Portal
  form (Tier "portal" design, not in this bundle): consultant picks yachts
  from a fleet API dropdown, fields auto-fill (editable), sections toggle,
  then publish → unique client URL (slug per client).
- Yacht images come from Sirv at 2000×1250. Demo images in this bundle are
  placeholders.
- VAT is "TBC" by design; APA percentage configurable per yacht (default 35).

## Assets
- `assets/logo-white.png` — OI wordmark (mandatory glyph).
- `assets/drops/ys-<yacht-id>-lead.webp` — the 10 demo lead images.
- `assets/drops/ys-serenity-t1..t3.webp`, `ys-eternal-spark-t1..t3.webp` — demo thumbnails; other yachts use `assets/demo-*.jpg` fallbacks.
- `assets/drops/lucy-photo.webp` — consultant portrait.
- `assets/pptx/image5.jpg` — costs-section photo.
- Fonts are NOT bundled (licensed); source them from the OI design system.

## Files
- `tier3-yacht-selection.html` — compiled, self-contained reference page (open in browser).
- `Tier 3 - Client Specific.dc.html` — editable source (custom DC format: template + logic class). Use for exact values and logic; do not copy its framework.
- `assets/` — see above.
