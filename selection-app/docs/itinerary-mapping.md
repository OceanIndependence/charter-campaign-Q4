# Itinerary mapping — the manifest

Branch `claude/tier2-website-itineraries` · 17 September 2026

Which itineraries a destination shows is now decided by `content/itinerary-destinations.json` and by nothing
else. An itinerary appears on a destination if and only if that destination id is listed against it in the
manifest. There is no ancestor walking, no inheritance to or from children, no radius test and no fallback: a
destination the manifest lists nothing against shows no itinerary panel. The Personalised Atlas is a
deterministic web application, and this mapping is now a static lookup.

The manifest holds **38 itineraries**, `_maxPerDestination` **3** and a
`_displayOrder` of 38 ids. The listed itineraries on a destination are sorted into `_displayOrder`
order and truncated to `_maxPerDestination`.

Coordinates are untouched: `content/itinerary-stops.json`, the geocoding, the 31 hand corrections and the
route drawing all behave exactly as before. This change decides only which itineraries a destination lists.

## Totals

| | Rules (link, inherited, sails-there) | Manifest |
|---|---|---|
| Destinations showing at least one itinerary | 94 | **93** |
| Destinations showing none | 31 | **32** |
| Mappings shown | 137 | **129** |

## 1. Every destination, in tree order

The itineraries each destination shows, in display order. **None** marks a destination with no itinerary panel.

### Mediterranean

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `mediterranean` | 1 | Cannes to Monaco · Rome to Naples · Dubrovnik to Trogir |
| `mediterranean/croatia` | 2 | Dubrovnik to Trogir · Split to Dubrovnik |
| `mediterranean/croatia/dubrovnik` | 3 | Dubrovnik to Trogir · Split to Dubrovnik |
| `mediterranean/croatia/hvar` | 3 | Dubrovnik to Trogir · Split to Dubrovnik |
| `mediterranean/cyprus` | 2 | **None** |
| `mediterranean/cyprus/limassol` | 3 | **None** |
| `mediterranean/france` | 2 | Cannes to Monaco · Calvi to Cala di Volpe · Monaco to Rome |
| `mediterranean/france/corsica` | 3 | Calvi to Cala di Volpe |
| `mediterranean/france/corsica/calvi` | 4 | Calvi to Cala di Volpe |
| `mediterranean/france/french-riviera` | 3 | Cannes to Monaco · Monaco to Rome |
| `mediterranean/france/french-riviera/antibes` | 4 | Cannes to Monaco |
| `mediterranean/france/french-riviera/cannes` | 4 | Cannes to Monaco |
| `mediterranean/france/french-riviera/cap-ferrat` | 4 | Cannes to Monaco |
| `mediterranean/france/french-riviera/eze` | 4 | Cannes to Monaco |
| `mediterranean/france/french-riviera/monaco` | 4 | Cannes to Monaco · Monaco to Rome |
| `mediterranean/france/french-riviera/st-tropez` | 4 | Cannes to Monaco |
| `mediterranean/france/french-riviera/porquerolles` | 4 | Cannes to Monaco |
| `mediterranean/france/french-riviera/villefranche` | 4 | Cannes to Monaco |
| `mediterranean/greece` | 2 | Corfu to Zakynthos · Cyclades Itinerary · Rhodes to Bodrum |
| `mediterranean/greece/athens` | 3 | Cyclades Itinerary |
| `mediterranean/greece/crete` | 3 | **None** |
| `mediterranean/greece/the-cyclades` | 3 | Cyclades Itinerary |
| `mediterranean/greece/the-cyclades/mykonos` | 4 | Cyclades Itinerary |
| `mediterranean/greece/the-cyclades/santorini` | 4 | Cyclades Itinerary |
| `mediterranean/greece/the-dodecanese` | 3 | Rhodes to Bodrum |
| `mediterranean/greece/the-ionian-islands` | 3 | Corfu to Zakynthos |
| `mediterranean/greece/the-ionian-islands/corfu` | 4 | Corfu to Zakynthos |
| `mediterranean/greece/the-ionian-islands/zakynthos` | 4 | Corfu to Zakynthos |
| `mediterranean/greece/the-saronic-islands` | 3 | **None** |
| `mediterranean/greece/the-saronic-islands/hydra` | 4 | **None** |
| `mediterranean/greece/the-saronic-islands/spetses` | 4 | **None** |
| `mediterranean/italy` | 2 | Rome to Naples · Naples to Sicily · Calvi to Cala di Volpe |
| `mediterranean/italy/amalfi-coast` | 3 | Rome to Naples · Naples to Sicily |
| `mediterranean/italy/amalfi-coast/amalfi` | 4 | Rome to Naples · Naples to Sicily |
| `mediterranean/italy/amalfi-coast/capri` | 4 | Rome to Naples · Naples to Sicily |
| `mediterranean/italy/amalfi-coast/positano` | 4 | Rome to Naples · Naples to Sicily |
| `mediterranean/italy/bari` | 3 | **None** |
| `mediterranean/italy/ischia` | 3 | Rome to Naples · Naples to Sicily |
| `mediterranean/italy/italian-riviera` | 3 | Monaco to Rome |
| `mediterranean/italy/italian-riviera/cinque-terre` | 4 | Monaco to Rome |
| `mediterranean/italy/italian-riviera/genoa` | 4 | **None** |
| `mediterranean/italy/italian-riviera/lerici` | 4 | **None** |
| `mediterranean/italy/italian-riviera/portofino` | 4 | Monaco to Rome |
| `mediterranean/italy/naples` | 3 | Rome to Naples · Naples to Sicily |
| `mediterranean/italy/naples/pontine-islands` | 4 | Rome to Naples |
| `mediterranean/italy/ravenna` | 3 | **None** |
| `mediterranean/italy/sardinia` | 3 | Calvi to Cala di Volpe |
| `mediterranean/italy/sardinia/olbia` | 4 | Calvi to Cala di Volpe |
| `mediterranean/italy/sicily` | 3 | Naples to Sicily · Aeolian Islands: Catania to Palermo |
| `mediterranean/italy/sicily/aeolian-islands` | 4 | Naples to Sicily · Aeolian Islands: Catania to Palermo |
| `mediterranean/italy/venice` | 3 | **None** |
| `mediterranean/malta` | 2 | **None** |
| `mediterranean/montenegro` | 2 | Dubrovnik to Trogir |
| `mediterranean/montenegro/budva` | 3 | Dubrovnik to Trogir |
| `mediterranean/montenegro/kotor` | 3 | Dubrovnik to Trogir |
| `mediterranean/spain` | 2 | Palma to Cala Morell |
| `mediterranean/spain/the-balearics` | 3 | Palma to Cala Morell |
| `mediterranean/spain/the-balearics/formentera` | 4 | Palma to Cala Morell |
| `mediterranean/spain/the-balearics/ibiza` | 4 | Palma to Cala Morell |
| `mediterranean/spain/the-balearics/mallorca` | 4 | Palma to Cala Morell |
| `mediterranean/spain/the-balearics/menorca` | 4 | Palma to Cala Morell |
| `mediterranean/spain/valencia` | 3 | **None** |
| `mediterranean/turkey` | 2 | Gocek to Gocek · Rhodes to Bodrum |
| `mediterranean/turkey/gocek` | 3 | Gocek to Gocek |
| `mediterranean/turkey/marmaris` | 3 | Gocek to Gocek |

### Caribbean

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `caribbean` | 1 | Nassau to Nassau · Antigua to St Lucia · St Maarten to St Maarten |
| `caribbean/the-bahamas` | 2 | Nassau to Nassau |
| `caribbean/the-bahamas/abaco-islands` | 3 | **None** |
| `caribbean/the-bahamas/bimini-islands` | 3 | **None** |
| `caribbean/the-bahamas/grand-bahama` | 3 | **None** |
| `caribbean/the-bahamas/nassau` | 3 | Nassau to Nassau |
| `caribbean/the-bahamas/the-exumas` | 3 | Nassau to Nassau |
| `caribbean/leeward-islands` | 2 | Antigua to St Lucia · St Maarten to St Maarten |
| `caribbean/leeward-islands/antigua` | 3 | Antigua to St Lucia · St Maarten to St Maarten |
| `caribbean/leeward-islands/st-barts` | 3 | St Maarten to St Maarten |
| `caribbean/leeward-islands/st-maarten` | 3 | St Maarten to St Maarten |
| `caribbean/the-windward-islands` | 2 | Antigua to St Lucia |
| `caribbean/the-windward-islands/dominica` | 3 | Antigua to St Lucia |
| `caribbean/the-windward-islands/martinique` | 3 | Antigua to St Lucia |
| `caribbean/the-windward-islands/st-vincent-the-grenadines` | 3 | **None** |
| `caribbean/virgin-islands` | 2 | Tortola to Tortola · St. Thomas to St. Thomas |
| `caribbean/virgin-islands/british-virgin-islands` | 3 | Tortola to Tortola · St. Thomas to St. Thomas |
| `caribbean/virgin-islands/us-virgin-islands` | 3 | St. Thomas to St. Thomas |

### North America

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `north-america` | 1 | The Florida Keys · New England · Sitka to Juneau, Alaska |
| `north-america/alaska` | 2 | Sitka to Juneau, Alaska |
| `north-america/bermuda` | 2 | **None** |
| `north-america/florida` | 2 | The Florida Keys |
| `north-america/new-england` | 2 | New England |

### Indian Ocean

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `indian-ocean` | 1 | Male to Male · Eden Island to Fregate Island, Seychelles |
| `indian-ocean/seychelles` | 2 | Eden Island to Fregate Island, Seychelles |
| `indian-ocean/tanzania` | 2 | **None** |
| `indian-ocean/maldives` | 2 | Male to Male |

### South East Asia

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `south-east-asia` | 1 | Langkawi to Phuket |
| `south-east-asia/indonesia` | 2 | **None** |
| `south-east-asia/malaysia` | 2 | Langkawi to Phuket |
| `south-east-asia/thailand` | 2 | Langkawi to Phuket |

### Australia & New Zealand

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `australia-and-new-zealand` | 1 | The Kimberley · Bay of Islands |
| `australia-and-new-zealand/australia` | 2 | The Kimberley |
| `australia-and-new-zealand/australia/the-great-barrier-reef` | 3 | **None** |
| `australia-and-new-zealand/australia/the-kimberley` | 3 | The Kimberley |
| `australia-and-new-zealand/australia/the-whitsundays` | 3 | **None** |
| `australia-and-new-zealand/new-zealand` | 2 | Bay of Islands |

### South Pacific

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `south-pacific` | 1 | Fiji Itinerary |
| `south-pacific/fiji` | 2 | Fiji Itinerary |
| `south-pacific/french-polynesia` | 2 | **None** |
| `south-pacific/new-caledonia` | 2 | **None** |

### South America

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `south-america` | 1 | **None** |
| `south-america/chile` | 2 | **None** |
| `south-america/ecuador` | 2 | **None** |
| `south-america/ecuador/galapagos-islands` | 3 | **None** |
| `south-america/patagonia` | 2 | **None** |

### Central America

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `central-america` | 1 | La Paz to La Paz · Panama to Costa Rica |
| `central-america/belize` | 2 | **None** |
| `central-america/costa-rica` | 2 | Panama to Costa Rica |
| `central-america/mexico` | 2 | La Paz to La Paz |

### Northern Europe

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `northern-europe` | 1 | Stavanger to Bergen |
| `northern-europe/norway` | 2 | Stavanger to Bergen |

### arctic

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `arctic` | 1 | East Greenland · Longyearbyen to Longyearbyen |
| `arctic/east-greenland` | 2 | East Greenland |
| `arctic/svalbard` | 2 | Longyearbyen to Longyearbyen |

### Middle East

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `middle-east` | 1 | Dubai to Abu Dhabi |
| `middle-east/the-red-sea` | 2 | **None** |

### Antarctica

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `antarctica` | 1 | Antarctica Itinerary · Scenic Eclipse in Antarctica |
| `antarctica/antarctica` | 2 | Antarctica Itinerary · Scenic Eclipse in Antarctica |

### Outside the region tree

| Destination | Level | Itineraries shown, in display order |
|---|---|---|
| `australasia/australia/the-great-barrier-reef` | 3 | **None** |

## 2. Destinations showing no itinerary

**32 of 125.** Each shows no itinerary panel at all.

`australasia/australia/the-great-barrier-reef`, `australia-and-new-zealand/australia/the-great-barrier-reef`, `australia-and-new-zealand/australia/the-whitsundays`, `caribbean/the-bahamas/abaco-islands`, `caribbean/the-bahamas/bimini-islands`, `caribbean/the-bahamas/grand-bahama`, `caribbean/the-windward-islands/st-vincent-the-grenadines`, `central-america/belize`, `indian-ocean/tanzania`, `mediterranean/cyprus`, `mediterranean/cyprus/limassol`, `mediterranean/greece/crete`, `mediterranean/greece/the-saronic-islands`, `mediterranean/greece/the-saronic-islands/hydra`, `mediterranean/greece/the-saronic-islands/spetses`, `mediterranean/italy/bari`, `mediterranean/italy/italian-riviera/genoa`, `mediterranean/italy/italian-riviera/lerici`, `mediterranean/italy/ravenna`, `mediterranean/italy/venice`, `mediterranean/malta`, `mediterranean/spain/valencia`, `middle-east/the-red-sea`, `north-america/bermuda`, `south-america`, `south-america/chile`, `south-america/ecuador`, `south-america/ecuador/galapagos-islands`, `south-america/patagonia`, `south-east-asia/indonesia`, `south-pacific/french-polynesia`, `south-pacific/new-caledonia`

## 3. Diff against the rules-based build

**22 mappings added** across 15 destinations; **30 removed** across 27 destinations.

### Added

| Destination | Itinerary now shown |
|---|---|
| `antarctica` | Antarctica Itinerary |
| `antarctica` | Scenic Eclipse in Antarctica |
| `antarctica/antarctica` | Scenic Eclipse in Antarctica |
| `arctic` | East Greenland |
| `arctic` | Longyearbyen to Longyearbyen |
| `australia-and-new-zealand` | The Kimberley |
| `australia-and-new-zealand` | Bay of Islands |
| `central-america` | La Paz to La Paz |
| `central-america` | Panama to Costa Rica |
| `indian-ocean` | Male to Male |
| `indian-ocean` | Eden Island to Fregate Island, Seychelles |
| `mediterranean` | Dubrovnik to Trogir |
| `mediterranean/france/french-riviera` | Monaco to Rome |
| `mediterranean/france/french-riviera/monaco` | Monaco to Rome |
| `mediterranean/italy` | Naples to Sicily |
| `middle-east` | Dubai to Abu Dhabi |
| `north-america` | The Florida Keys |
| `north-america` | New England |
| `north-america` | Sitka to Juneau, Alaska |
| `northern-europe` | Stavanger to Bergen |
| `south-east-asia` | Langkawi to Phuket |
| `south-pacific` | Fiji Itinerary |

### Removed

| Destination | Itinerary no longer shown |
|---|---|
| `caribbean/the-bahamas` | The Florida Keys |
| `caribbean/the-bahamas/abaco-islands` | Nassau to Nassau |
| `caribbean/the-bahamas/bimini-islands` | Nassau to Nassau |
| `caribbean/the-bahamas/bimini-islands` | The Florida Keys |
| `caribbean/the-bahamas/grand-bahama` | Nassau to Nassau |
| `caribbean/the-windward-islands/martinique` | St Maarten to St Maarten |
| `caribbean/the-windward-islands/st-vincent-the-grenadines` | Antigua to St Lucia |
| `caribbean/virgin-islands` | St Maarten to St Maarten |
| `caribbean/virgin-islands/us-virgin-islands` | Tortola to Tortola |
| `mediterranean` | Calvi to Cala di Volpe |
| `mediterranean/france/corsica` | Monaco to Rome |
| `mediterranean/greece/crete` | Cyclades Itinerary |
| `mediterranean/greece/the-dodecanese` | Gocek to Gocek |
| `mediterranean/greece/the-ionian-islands` | Bay of Islands |
| `mediterranean/greece/the-saronic-islands` | Cyclades Itinerary |
| `mediterranean/italy` | Monaco to Rome |
| `mediterranean/italy/italian-riviera` | Cannes to Monaco |
| `mediterranean/italy/italian-riviera/genoa` | Monaco to Rome |
| `mediterranean/italy/italian-riviera/lerici` | Naples to Sicily |
| `mediterranean/italy/italian-riviera/lerici` | Monaco to Rome |
| `mediterranean/malta` | Naples to Sicily |
| `mediterranean/malta` | Aeolian Islands: Catania to Palermo |
| `mediterranean/montenegro` | Split to Dubrovnik |
| `mediterranean/montenegro/budva` | Split to Dubrovnik |
| `mediterranean/montenegro/kotor` | Split to Dubrovnik |
| `mediterranean/spain/valencia` | Palma to Cala Morell |
| `mediterranean/turkey` | Cyclades Itinerary |
| `mediterranean/turkey/gocek` | Rhodes to Bodrum |
| `mediterranean/turkey/marmaris` | Rhodes to Bodrum |
| `south-east-asia/indonesia` | Langkawi to Phuket |

## 4. Itineraries reaching only a level 1 region

These are listed against a region and nothing beneath it, so they appear on the region page alone.

| Itinerary | Region(s) |
|---|---|
| Marina del Rey to Marina del Rey | `north-america` |
| San Juan Islands | `north-america` |
| Dubai to Abu Dhabi | `middle-east` |

## 5. Where the cap truncates

`_maxPerDestination` is 3. These destinations have more listed against them, so the
tail of the display order is not shown.

| Destination | Shown | Listed but cut |
|---|---|---|
| `caribbean` | Nassau to Nassau · Antigua to St Lucia · St Maarten to St Maarten | Tortola to Tortola · St. Thomas to St. Thomas |
| `mediterranean` | Cannes to Monaco · Rome to Naples · Dubrovnik to Trogir | Corfu to Zakynthos · Cyclades Itinerary · Palma to Cala Morell · Naples to Sicily · Gocek to Gocek · Rhodes to Bodrum · Calvi to Cala di Volpe · Monaco to Rome · Split to Dubrovnik · Aeolian Islands: Catania to Palermo |
| `mediterranean/italy` | Rome to Naples · Naples to Sicily · Calvi to Cala di Volpe | Monaco to Rome · Aeolian Islands: Catania to Palermo |
| `north-america` | The Florida Keys · New England · Sitka to Juneau, Alaska | Marina del Rey to Marina del Rey · San Juan Islands |

### Listed in the manifest but shown nowhere

| Itinerary | Listed against | Why it does not appear |
|---|---|---|
| Marina del Rey to Marina del Rey | `north-america` | Cut by the cap: every destination it is listed against already shows 3 itineraries earlier in the display order. |
| San Juan Islands | `north-america` | Cut by the cap: every destination it is listed against already shows 3 itineraries earlier in the display order. |
| Patagonia Itinerary | `south-america`, `south-america/patagonia` | Fewer than two of its places could be located, so the route cannot be drawn. A coordinate matter, not a manifest one. |

## 6. One further consequence, flagged not fixed

The card teaser is gone. Under the rules the build attached each card the blurb from the destination page's own
itinerary link (`itineraryLinks[].summary`), and 75 of the mappings carried one. The manifest has no teaser
field, and reading `itineraryLinks` is exactly what this change removes, so the cards now fall back to the line
of stop names the panel already computes.

If the blurb is wanted back it is a small, separate decision: either add a `teaser` to the manifest entry, or
let the build read `itineraryLinks[].summary` for wording only, never for the mapping. Nothing was assumed
either way here.

## 7. What changed, and what did not

| | |
|---|---|
| `content/itinerary-destinations.json` | Added: the manifest, as supplied. |
| `scripts/build-itineraries.mjs` | The link, inherited and sails-there rules deleted, along with `NEAR_KM`, `NEAR_MIN_STOPS`, `linksFor()` and `nearbyFor()`. The manifest is read, validated and applied. |
| `data/itineraries.json`, `docs/itinerary-coverage.md` | Rebuilt. |
| `data/destinations.json` | Untouched. `itineraryLinks` is still written by the crawl and is no longer read by the build. |
| `content/itinerary-stops.json`, the geocoding, the hand corrections, the route drawing | Untouched. |

### The two redirected destination ids — now corrected

Dominica and Martinique were nested under St Vincent & the Grenadines in the snapshot because the importer
derived their ids from the URLs it followed rather than from each page's canonical URL. The website tree has
since been fixed, and both now sit directly under The Windward Islands:

| Was | Is |
|---|---|
| `caribbean/the-windward-islands/st-vincent-the-grenadines/dominica` (level 4) | `caribbean/the-windward-islands/dominica` (level 3) |
| `caribbean/the-windward-islands/st-vincent-the-grenadines/martinique` (level 4) | `caribbean/the-windward-islands/martinique` (level 3) |

`data/destinations.json`, the two manifest lines in `content/itinerary-destinations.json` and the four
provenance labels in `content/itinerary-stops.json` were all updated in the same commit, so the build does not
fail with `manifest: itinerary "…" lists destination "…", which has no record in data/destinations.json`.
Coordinates were carried across unchanged: Dominica stays at 15.4021, -61.4273 and Martinique at 14.6415,
-61.0242, and the geocoder made no requests on the rebuild. The Windward Islands now lists all three children,
and St Vincent & the Grenadines lists none.
