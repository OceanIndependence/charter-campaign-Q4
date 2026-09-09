# Tier 2 — Personalised Atlas: build report

Built 09 September 2026 on branch `claude/tier2-personalised-atlas-7vi15o`. Tier 2 is a
composition of Tier 1 (the 2027 Atlas at `/2027-charter-season`) and Tier 3 (Yacht
Selection at `/selection/<slug>`): the client page lives at `/atlas/<slug>`, the
consultant builds it in the same Charter Portal, and nothing below duplicates an
existing module.

## Design reference

The brief pointed at `design/tier2-personalised-atlas/`, which does not exist on any
branch. The only Tier 2 export in the repository is `personalised-atlas/index.html`
(a Claude Design bundle: 32 packed assets, an `<atlas-globe-3d>` prototype and a
`DCLogic` script). It was unpacked and used for type, colour, spacing and component
states; the page structure follows the brief where the two differ (see "Not matched
exactly" at the end).

## Tier 1 modules reused, and from where

| Concern | Module | How Tier 2 uses it |
|---|---|---|
| Destination content snapshot | `data/destinations.json` (written by `npm run import:destinations`) | Source of the destination tree, ids, coordinates, copy and imagery. Build-time content: the import is a CLI crawl, not a Cron and not a request-time fetch. |
| Snapshot index and helpers | `src/lib/atlas/data.ts` (`buildIndex`, `children`, `parentOf`, `regionOf`, `eyebrowFor`, `shortIntro`, `topLevelPins`) | Destination pickers, Atlas default copy, the dim "other" pins frozen into each published page. |
| Website page parser | `src/server/atlas/website.mjs` — **extracted from `scripts/import-destinations.mjs`**, which now imports it | The Tier 2 live refresh re-reads one destination page with the same parser the Tier 1 import uses. |
| Globe engine | `src/lib/atlas/globe.ts` via `src/components/atlas/AtlasGlobe.tsx` | The Tier 2 globe stage. One additive change: the wrapper now accepts `home` (the engine already did). |
| Tier 1 page | `src/components/atlas/AtlasPage.tsx` | One additive change: `/2027-charter-season?destination=<id>` opens that destination, so "EXPLORE IT IN THE ATLAS →" deep-links. |
| Yachtfolio client, normaliser | `src/server/yachtfolio/client.mjs`, `normalise.mjs` | Unchanged; Tier 2 yachts are picked through the same `GET /api/fleet`, `GET /api/fleet/:yfId`, `GET /api/fleet/:yfId/images`. |
| Fleet cache | `src/server/fleet.mjs` | Unchanged flow; gains a demo fallback when `YACHTFOLIO_PASSKEY` is absent (`src/server/demo/fleet.mjs`). |
| sharp image pipeline | `src/server/yachtfolio/images.mjs` (`cropToSizes`) | Yacht imagery as before; destination imagery from the website is cropped to 2000 × 1250 and 1000 × 625 and stored under `atlas/images/<sha1 of source URL>` in the public IMAGES store. |
| Yacht detail component | `src/components/SpecPanel.tsx` | The drawer. Three optional props added (`signedBy`, `vatText`, titled `highlights`); Tier 3 rendering is unchanged. |
| Consultant footer | `src/components/ConsultantBlock.tsx` | Reused as-is; the WhatsApp link now goes through `whatsappHref()` so a typed number becomes `https://wa.me/<digits>` on both tiers. |
| Draft / publish / versions | `src/server/pages.mjs` | Same store, index, slug claiming, versions, rollback and unpublish. Adds `tier` (fixed at creation), an empty Tier 2 draft, tier-aware duplicate and dashboard metadata. Both tiers share one slug namespace; each route 404s the other tier's slug. |
| Auth | `src/server/auth/*` | Unchanged. Owner is stamped from the session identity (Microsoft object id once the provider is switched). |
| Yacht mapping and price maths | `src/lib/portal-map.ts` (`mapDraftYacht`) | Tier 2 yachts go through the same mapping, so APA amount and total are computed from the weekly rate at preview and publish, never typed. |

New modules: `src/lib/atlas-map.ts` (Tier 2 draft → frozen page config, slug and
validation), `src/server/atlas/content.ts` (Atlas defaults, live refresh with cache
fallback, image preparation), `src/components/personalised/*` (client page),
`src/components/portal/Tier2Form.tsx` (consultant form), `src/app/atlas/[slug]`,
`src/app/api/atlas/*`, `src/server/demo/*`.

## Globe API adaptations

The design's `DCLogic` script drives `<atlas-globe-3d>` with `setPins`, `setFocus`,
`setSelected`, `flyTo`, `zoomBy`, `setOptions` and listens for `pin-select` /
`globe-deselect` window events. The production engine exposes `setPins`, `setSubPins`,
`setFocus`, `setSelected`, `setOptions`, `flyTo`, `zoomBy`, `reset` and takes
`onPinSelect` / `onDeselect` callbacks (no DOM events).

| Design | Production |
|---|---|
| `pins[].med: true` and `setOptions({ medEmphasis: true })` | No such flags. The three chosen destinations are `featured: true, priority: true` (mint dot, labelled at rest); every other Atlas destination is `featured: false, priority: false` (grey dot, label only when zoomed or hovered). |
| `setFocus([three ids])` | Same call. Pins outside the focus render at 55 per cent and greyscale, remain clickable, and never show a label until selected. |
| `setOptions({ drift: false, lockDrag: false, lockZoom: true, graticule: true })` | Same options exist; `medEmphasis` dropped. Wheel and pinch zoom are locked so page scrolling is never captured; the +/− buttons call `zoomBy`, which ignores the lock. |
| `flyTo(40.2, 12.6, 2.6, 1800)` on setup; 3.6 for a chosen pin; 2.2 for another pin | Same numbers. The wrapper's new `home` prop makes (40.2, 12.6, 2.6) the resting view so close returns there. |
| `pin-select` / `globe-deselect` events | `onPinSelect(id)` / `onDeselect()` props on the wrapper. |
| An 800 ms interval that re-attaches to the element | Not needed; the React wrapper owns the engine's lifecycle and replays calls made before it is ready. |

Interaction wiring: tab or chosen pin → `setSelected`, `setFocus(three)`, `flyTo`,
open the panel, scroll the rail to the first matching yacht; another pin →
`setFocus([...three, id])`, "BEYOND THE SHORTLIST" panel; card → drawer, select the
yacht's first destination and `setFocus(the yacht's destinations)` until the drawer
closes; close or ocean tap → `setFocus(three)`, `setSelected(null)`, fly home.

## Destination content: refresh and fallback

When a consultant chooses a destination, `GET /api/atlas/destinations/<id>` re-reads
the destination page from the website with the shared parser (six-second timeout),
takes copy and imagery from it, and prepares up to four candidate images through sharp.
If the fetch fails, the snapshot copy is used and the server logs, for example:

```
[atlas] mediterranean/italy/venice: website fetch failed (The operation was aborted due to timeout) — content served from the cached Atlas snapshot (2026-09-08T10:43:20.720Z)
```

The form shows "Copy re-read from the website" or "Copy from the cached Atlas snapshot"
on each slot, and the published config records `contentSources` per destination. In
the build sandbox the website's HTML timed out while its images downloaded, so every
destination fell back to cache; the live path uses the same parser as the Tier 1
import and should answer on Vercel.

Atlas defaults per block: eyebrow = `eyebrowFor()` ("MEDITERRANEAN · ITALY"); deck
line = the tail of the page title after the colon, else the "Popular Destinations" key
fact, else the child place names, else the summary's first sentence; description =
`shortIntro()` (lede or first paragraph, two sentences); images = hero, card, Open
Graph image, child card images, parent hero, in that order, de-duplicated.

## Destination ids available ( in the snapshot of 08 September 2026)

Regions themselves are also selectable (`mediterranean`, `caribbean`, …).

- **mediterranean** (65): `mediterranean/croatia`, `mediterranean/cyprus`, `mediterranean/france`, `mediterranean/greece`, `mediterranean/italy`, `mediterranean/malta`, `mediterranean/montenegro`, `mediterranean/spain`, `mediterranean/turkey`, `mediterranean/croatia/dubrovnik`, `mediterranean/croatia/hvar`, `mediterranean/cyprus/limassol`, `mediterranean/france/corsica`, `mediterranean/france/french-riviera`, `mediterranean/greece/athens`, `mediterranean/greece/crete`, `mediterranean/greece/the-cyclades`, `mediterranean/greece/the-dodecanese`, `mediterranean/greece/the-ionian-islands`, `mediterranean/greece/the-saronic-islands`, `mediterranean/italy/amalfi-coast`, `mediterranean/italy/bari`, `mediterranean/italy/ischia`, `mediterranean/italy/italian-riviera`, `mediterranean/italy/naples`, `mediterranean/italy/ravenna`, `mediterranean/italy/sardinia`, `mediterranean/italy/sicily`, `mediterranean/italy/venice`, `mediterranean/montenegro/budva`, `mediterranean/montenegro/kotor`, `mediterranean/spain/the-balearics`, `mediterranean/spain/valencia`, `mediterranean/turkey/gocek`, `mediterranean/turkey/marmaris`, `mediterranean/france/corsica/calvi`, `mediterranean/france/french-riviera/antibes`, `mediterranean/france/french-riviera/cannes`, `mediterranean/france/french-riviera/cap-ferrat`, `mediterranean/france/french-riviera/eze`, `mediterranean/france/french-riviera/monaco`, `mediterranean/france/french-riviera/porquerolles`, `mediterranean/france/french-riviera/st-tropez`, `mediterranean/france/french-riviera/villefranche`, `mediterranean/greece/the-cyclades/mykonos`, `mediterranean/greece/the-cyclades/santorini`, `mediterranean/greece/the-ionian-islands/corfu`, `mediterranean/greece/the-ionian-islands/zakynthos`, `mediterranean/greece/the-saronic-islands/hydra`, `mediterranean/greece/the-saronic-islands/spetses`, `mediterranean/italy/amalfi-coast/amalfi`, `mediterranean/italy/amalfi-coast/capri`, `mediterranean/italy/amalfi-coast/positano`, `mediterranean/italy/italian-riviera/cinque-terre`, `mediterranean/italy/italian-riviera/genoa`, `mediterranean/italy/italian-riviera/lerici`, `mediterranean/italy/italian-riviera/portofino`, `mediterranean/italy/naples/pontine-islands`, `mediterranean/italy/sardinia/olbia`, `mediterranean/italy/sicily/aeolian-islands`, `mediterranean/spain/the-balearics/formentera`, `mediterranean/spain/the-balearics/ibiza`, `mediterranean/spain/the-balearics/mallorca`, `mediterranean/spain/the-balearics/menorca`
- **caribbean** (18): `caribbean/leeward-islands`, `caribbean/the-bahamas`, `caribbean/the-windward-islands`, `caribbean/virgin-islands`, `caribbean/leeward-islands/antigua`, `caribbean/leeward-islands/st-barts`, `caribbean/leeward-islands/st-maarten`, `caribbean/the-bahamas/abaco-islands`, `caribbean/the-bahamas/bimini-islands`, `caribbean/the-bahamas/grand-bahama`, `caribbean/the-bahamas/nassau`, `caribbean/the-bahamas/the-exumas`, `caribbean/the-windward-islands/st-vincent-the-grenadines`, `caribbean/virgin-islands/british-virgin-islands`, `caribbean/virgin-islands/us-virgin-islands`, `caribbean/the-windward-islands/st-vincent-the-grenadines/dominica`, `caribbean/the-windward-islands/st-vincent-the-grenadines/martinique`
- **north-america** (5): `north-america/alaska`, `north-america/bermuda`, `north-america/florida`, `north-america/new-england`
- **indian-ocean** (4): `indian-ocean/maldives`, `indian-ocean/seychelles`, `indian-ocean/tanzania`
- **south-east-asia** (4): `south-east-asia/indonesia`, `south-east-asia/malaysia`, `south-east-asia/thailand`
- **australia-and-new-zealand** (6): `australia-and-new-zealand/australia`, `australia-and-new-zealand/new-zealand`, `australia-and-new-zealand/australia/the-great-barrier-reef`, `australia-and-new-zealand/australia/the-kimberley`, `australia-and-new-zealand/australia/the-whitsundays`
- **south-pacific** (4): `south-pacific/fiji`, `south-pacific/french-polynesia`, `south-pacific/new-caledonia`
- **south-america** (5): `south-america/chile`, `south-america/ecuador`, `south-america/patagonia`, `south-america/ecuador/galapagos-islands`
- **central-america** (4): `central-america/belize`, `central-america/costa-rica`, `central-america/mexico`
- **northern-europe** (2): `northern-europe/norway`
- **arctic** (3): `arctic/east-greenland`, `arctic/svalbard`
- **middle-east** (2): `middle-east/the-red-sea`
- **antarctica** (2): `antarctica/antarctica`

## Yachtfolio fields that did not map

No Yachtfolio passkey is configured in this environment, so this is from the
normaliser (`src/server/yachtfolio/normalise.mjs`) and the recorded shape checks, not a
live run.

- **`general.data_source` variants.** `auto`, `manual` and `text` are handled: the spec
  block moves to `brochure.auto`, `brochure.manual` or `brochure.manual_text`
  respectively. Any other value falls through to `manual_text` and
  `checkBrochureShape()` records "unexpected `general.data_source` value". Tier 2
  inherits this unchanged; the value is surfaced as `dataSource` on `GET /api/fleet/:yfId`.
- **Cruising areas → destinations.** Yachtfolio's `operating_areas` resolve to area
  names ("WEST MEDITERRANEAN, ITALY, …"). There is no Yachtfolio id for an Atlas
  destination, so the form matches the area string against each chosen destination's
  name, its places and its country, then against the region name. The consultant
  confirms or changes the ticks; a yacht with none ticked is warned about, not blocked.
- **E-brochure link.** Not in the API payloads the normaliser knows; pasted by the
  consultant as on Tier 3. The demo yachts have none, so their drawers hide VIEW BROCHURE.
- **VAT.** Tier 2 shows free text ("Varies by location") and excludes VAT from the total;
  Tier 3's percentage is not used.
- **Highlights, known-yacht flag, one-line note.** Consultant fields; nothing in
  Yachtfolio corresponds.
- **Builder** is missing for some yachts (recorded in `missing`); the rail meta line
  omits it by design ("38M · 10 GUESTS · 5 STATEROOMS").

## Demo fallback

With `YACHTFOLIO_PASSKEY` absent, `GET /api/fleet` and the per-yacht routes serve the six
demo yachts from `src/server/demo/fleet.mjs` (SERENITY, LAFAYETTE, ETERNAL SPARK, DAMARI,
LEMON NOT LIME, AURELIA; ids 900001–900006; every record carries `source: "demo"`) and the
Cron sync returns a demo note instead of failing. Images are the design export's,
cropped once through the sharp pipeline and committed under `public/assets/demo/`.

`/atlas/harrington-summer-2027` renders `demoAtlasConfig()` whenever nothing has been
published under that slug (`DEMO_PAGES=false` disables it). The first dashboard load in
demo mode seeds the same Harrington draft into the signed-in consultant's selections so
the Tier 2 form can be reviewed with content in it.

## Redacted sample of one Tier 2 page config

From `GET /api/atlas/demo`; two of three destinations, two of six yachts and 37 other pins
elided. Demo figures throughout; APA is 35 per cent of the weekly rate and the total is
rate plus APA, both computed by `mapDraftYacht`.

```json
{
  "tier": 2,
  "slug": "harrington-summer-2027",
  "clientNames": "Mr and Mrs Harrington",
  "clientGreeting": "Mr and Mrs Harrington, your summer 2027.",
  "introNote": "Last July you cruised the Amalfi Coast aboard SERENITY. As one of the first to secure your dates last season, I wanted you to see the 2027 season before we open it more widely.",
  "seasonNote": { "eyebrow": "A NOTE ON JULY", "body": "You chartered in the third week of July, consistently the most requested week of the Mediterranean season. …" },
  "footerDisclaimer": "These vessels are offered subject to change, price change, and owners’ final approval.",
  "destinations": [
    {
      "id": "mediterranean/italy/sardinia",
      "name": "Sardinia",
      "lat": 40.0919,
      "lon": 8.9878,
      "guideUrl": "https://www.oceanindependence.com/yacht-charter/destinations/mediterranean/italy/sardinia/",
      "eyebrow": { "value": "THE NATURAL NEXT STEP", "source": "consultant" },
      "deckLine": { "value": "Two islands, one week, no repetition", "source": "consultant" },
      "description": { "value": "For yacht charter guests, Sardinia is not just a destination to experience the pinnacle of Mediterranean elegance. …", "source": "atlas" },
      "images": [
        { "value": "https://www.oceanindependence.com/wp-content/uploads/2024/03/rsz_istock-886958930sardiniamain.jpg", "source": "atlas" },
        { "value": "https://www.oceanindependence.com/wp-content/uploads/2024/03/rsz_sardinia-2467683.jpg", "source": "atlas" }
      ]
    },
    "… two more"
  ],
  "yachts": [
    {
      "id": "serenity",
      "yachtfolioId": 900001,
      "name": "SERENITY",
      "lengthM": 38,
      "yearRefit": "2019 / 2024",
      "guests": 10,
      "crew": 7,
      "staterooms": { "count": 5, "breakdown": "1 master, 3 double, 1 twin" },
      "cruisingArea": "WEST MEDITERRANEAN, ITALY, AMALFI COAST",
      "currency": "EUR",
      "weeklyRate": 150000,
      "apaPct": 35,
      "apaAmount": 52500,
      "totalAmount": 202500,
      "notes": "Same Captain, same crew, and the corners you missed.",
      "leadImageUrl": "/assets/demo/serenity-lead.jpg",
      "interiorImageUrl": "/assets/demo/serenity-1.jpg",
      "exteriorImageUrl": "/assets/demo/yacht-aft-deck.jpg",
      "lifestyleImageUrl": "/assets/demo/serenity-2.jpg",
      "brochureUrl": "#",
      "destinationIds": ["mediterranean/italy/amalfi-coast"],
      "knownYacht": true,
      "consultantNote": "Same Captain, same crew, and the corners you missed.",
      "vatText": "Varies by location",
      "highlights": [
        { "title": "LO SCOGLIO, NERANO", "line": "Lunch on the water, reached only by tender" },
        { "title": "DA ADOLFO, POSITANO", "line": "No road access, so you arrive by boat" },
        { "title": "LI GALLI AT FIRST LIGHT", "line": "An early-morning swim before the day boats arrive" }
      ]
    },
    "… five more"
  ],
  "otherPins": [
    { "id": "mediterranean/croatia", "name": "Croatia", "lat": 44.94, "lon": 14.7823 },
    { "id": "mediterranean/cyprus", "name": "Cyprus", "lat": 35.0275, "lon": 33.2162 },
    "… 37 more"
  ],
  "consultant": {
    "name": "Lucy",
    "title": "Charter Consultant, Ocean Independence",
    "phone": "+41 44 ••• •• ••",
    "email": "l•••@oceanindependence.com",
    "whatsapp": "https://wa.me/4144•••••••",
    "photoUrl": "/assets/demo/lucy-photo.jpg"
  },
  "atlasUrl": "/2027-charter-season",
  "contentSources": {
    "mediterranean/italy/amalfi-coast": "cache",
    "mediterranean/italy/sardinia": "cache",
    "mediterranean/italy/sicily/aeolian-islands": "cache"
  }
}
```

## Verified in this build

- `tsc --noEmit` and `next build` pass.
- Playwright against `next start` (single-consultant auth, filesystem store, no passkey):
  the dashboard seeds the Harrington draft and shows the Tier column and filter; the
  tier chooser appears on NEW SELECTION; the Tier 2 form loads with three destinations
  and six yachts; re-picking a destination fetches Atlas content and prepares images
  through sharp; PREVIEW renders the Tier 2 page; PUBLISH writes version 1 and the
  dashboard shows PUBLISHED with LIVE PAGE / COPY LINK pointing at `/atlas/…`;
  `/selection/harrington-summer-2027` is a 404.
- The drawer for ETERNAL SPARK shows WEEKLY RATE EUR 334,800, VAT "Varies by location",
  APA (35%) EUR 117,180, TOTAL EUR 451,980.

## Not matched exactly, and why

- **Design structure.** The committed export is an earlier iteration: full-bleed Amalfi
  hero at 76vh, "PREPARED FOR …" in the header, a 64vh globe with the yacht cards and
  highlights inside the aside, no rail and no drawer. The build follows the brief's
  section list (header label, intro band, 85vh globe, rail, drawer, season note,
  footer, disclaimer) and takes its type ramp, colours, spacing and component states
  from the export.
- **Highlights** belong to yachts in the brief; in the export they are per-destination.
  They are yacht fields here, in the export's numbered style.
- **"SHALL WE HOLD SOME OPTIONS?"** in the export's footer is replaced by the Tier 3
  footer's WHATSAPP ME, as the brief asks.
- **Live website refresh** could not be exercised from the build sandbox (HTML requests
  time out; images download), so every destination in the demo is marked `cache`.
- **Demo destination images** for Sardinia and the Aeolian Islands are the website URLs
  rendered 16:10 by CSS rather than sharp-cropped files, because the demo page must
  render without an image store. Consultant-created pages go through sharp.
- **Fonts.** Gotham Light, Book, Medium and Gotham Condensed Medium and Bold are the
  licensed files already in `public/fonts`; the export also declares italics and
  Gotham Black, which the page does not use.
