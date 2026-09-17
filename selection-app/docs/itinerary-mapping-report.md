# Tier 2 itinerary mapping — how each itinerary reaches each destination

Branch `claude/tier2-website-itineraries` at `174a0e8` · written 18 September 2026 · read-only: no code, JSON or content changed.

Figures are computed by replaying the mapping in `scripts/build-itineraries.mjs` against the committed
`data/destinations.json`, `content/itinerary-stops.json` and `data/itineraries.json`. The replay reproduces
`data/itineraries.json` exactly — **0 mismatches across all 125 destinations** — so the rule attributed to each
mapping below is the rule that actually produced it.

## The three rules, as implemented

| Rule | Name used below | What it does |
|---|---|---|
| 1 | `link` | The destination's **own** website page links to the itinerary (`itineraryLinks` on that destination). |
| 2 | `inherited` | The destination is a **place (level 4)** with no links of its own; it takes the links of the nearest ancestor at level 3 or above that has some. Implemented as `linksFor()`, which only walks up while the ancestor is level ≥ 3, so it stops at a cruising ground and never reaches a country or region. |
| 3 | `sails-there` | At least **two day headings** of the itinerary have a located place within the destination's radius. |

Order matters: link and inherited candidates are added first, in the order the website lists them, then
sails-there candidates ordered by how many days fall inside the radius (ties by title). The first three are
shown; the rest are dropped (§5).

One itinerary, **Patagonia Itinerary**, is not drawable (fewer than two located places) and so appears in no
mapping at all. The tables below therefore cover 31 mapped itineraries out of 32 crawled.

Two definitions used throughout:

- **A destination links to an itinerary**, not the other way round. "What the website page links to" in §1 means
  the destination pages whose `itineraryLinks` include that itinerary — the site's own editorial choice.
- **An itinerary's home region** is the set of top-level regions of those linking destinations. It is used for the
  cross-region test, in preference to the region segment in the itinerary's URL, which does not always agree with
  the Atlas tree (`/itineraries/australasia/…` for an Australia and New Zealand destination,
  `/itineraries/indian-ocean/…` for the South East Asia route).

## What the tables show

- **122 mappings are shown** across 91 destinations. 80 come from the website's own links, 42 from sails-there
  alone.
- **20 mappings fail at least one suspect test** (§3). Thirteen are sails-there with nothing in the destination's
  own line of pages pointing at the itinerary; two cross a top-level region; eight rest on hand-corrected or
  flagged coordinates.
- **Only two mappings cross a region**, and both are the same pairing at two levels: The Florida Keys appearing on
  the Bahamas and on the Bimini Islands. The rest of the noise is inside the Mediterranean, where countries sit
  within a few hundred kilometres of each other and the fixed radius cannot tell a coastline from its neighbour.
- **The radius is a fixed constant per level**, not anything the website supplies (§4). A country is 260 km, which
  is what carries a Florida route into the Bahamas and the Cyclades into Turkey.
- **Nothing is dropped by a cap at the itinerary end** — no such cap exists. Two destinations have more
  candidates than the panel shows (§5).
- Of the two fixes (§6), dropping sails-there costs 15 destinations their only itinerary and removes 42 mappings;
  requiring a shared region removes only the two Florida Keys mappings and costs no coverage at all.

## 1. Itinerary view

All 32 crawled itineraries. "Mapped to" lists the destinations where the itinerary is shown, with every rule that
fires for that pairing. "Linked from" is what the website's own destination pages point at it.

| Itinerary | URL | Mapped to (rules) | Linked from (the website's own choice) |
|---|---|---|---|
| Aeolian Islands: Catania to Palermo | `/mediterranean/aeolian-islands-catania-to-palermo/` | `mediterranean/italy/sicily` (sails-there)<br>`mediterranean/italy/sicily/aeolian-islands` (link, sails-there)<br>`mediterranean/malta` (sails-there) | `mediterranean/italy/sicily/aeolian-islands` |
| Antarctica Itinerary | `/antarctica/antarctica-itinerary/` | `antarctica/antarctica` (link) | `antarctica/antarctica` |
| antigua to st lucia | `/caribbean/antigua-to-st-lucia/` | `caribbean` (link)<br>`caribbean/leeward-islands` (sails-there)<br>`caribbean/leeward-islands/antigua` (link, sails-there)<br>`caribbean/the-windward-islands` (sails-there)<br>`caribbean/the-windward-islands/st-vincent-the-grenadines` (sails-there)<br>`caribbean/the-windward-islands/st-vincent-the-grenadines/dominica` (sails-there)<br>`caribbean/the-windward-islands/st-vincent-the-grenadines/martinique` (sails-there) | `caribbean`<br>`caribbean/leeward-islands/antigua` |
| Bay of Islands | `/south-pacific/bay-of-islands/` | `australia-and-new-zealand/new-zealand` (link)<br>`mediterranean/greece/the-ionian-islands` (link) | `australia-and-new-zealand/new-zealand`<br>`mediterranean/greece/the-ionian-islands` |
| calvi to cala di volpe | `/mediterranean/calvi-to-cala-di-volpe/` | `mediterranean` (link)<br>`mediterranean/france` (sails-there)<br>`mediterranean/france/corsica` (sails-there)<br>`mediterranean/france/corsica/calvi` (sails-there)<br>`mediterranean/italy` (sails-there)<br>`mediterranean/italy/sardinia` (sails-there)<br>`mediterranean/italy/sardinia/olbia` (sails-there) | `mediterranean` |
| Cannes to Monaco | `/mediterranean/cannes-to-monaco/` | `mediterranean` (link)<br>`mediterranean/france` (link, sails-there)<br>`mediterranean/france/french-riviera` (link, sails-there)<br>`mediterranean/france/french-riviera/antibes` (link, sails-there)<br>`mediterranean/france/french-riviera/cannes` (link, sails-there)<br>`mediterranean/france/french-riviera/cap-ferrat` (link, sails-there)<br>`mediterranean/france/french-riviera/eze` (link, sails-there)<br>`mediterranean/france/french-riviera/monaco` (link, sails-there)<br>`mediterranean/france/french-riviera/porquerolles` (link)<br>`mediterranean/france/french-riviera/st-tropez` (link, sails-there)<br>`mediterranean/france/french-riviera/villefranche` (link, sails-there)<br>`mediterranean/italy/italian-riviera` (sails-there) | `mediterranean`<br>`mediterranean/france`<br>`mediterranean/france/french-riviera`<br>`mediterranean/france/french-riviera/antibes`<br>`mediterranean/france/french-riviera/cannes`<br>`mediterranean/france/french-riviera/cap-ferrat`<br>`mediterranean/france/french-riviera/eze`<br>`mediterranean/france/french-riviera/monaco`<br>`mediterranean/france/french-riviera/porquerolles`<br>`mediterranean/france/french-riviera/st-tropez`<br>`mediterranean/france/french-riviera/villefranche` |
| corfu to zakynthos | `/mediterranean/corfu-to-zakynthos/` | `mediterranean/greece` (sails-there)<br>`mediterranean/greece/the-ionian-islands` (sails-there)<br>`mediterranean/greece/the-ionian-islands/corfu` (link, sails-there)<br>`mediterranean/greece/the-ionian-islands/zakynthos` (link, sails-there) | `mediterranean`<br>`mediterranean/greece/the-ionian-islands/corfu`<br>`mediterranean/greece/the-ionian-islands/zakynthos` |
| Cyclades Itinerary | `/mediterranean/cyclades-itinerary/` | `mediterranean/greece` (sails-there)<br>`mediterranean/greece/athens` (link, sails-there)<br>`mediterranean/greece/crete` (sails-there)<br>`mediterranean/greece/the-cyclades` (link, sails-there)<br>`mediterranean/greece/the-cyclades/mykonos` (inherited, sails-there)<br>`mediterranean/greece/the-cyclades/santorini` (inherited, sails-there)<br>`mediterranean/greece/the-saronic-islands` (sails-there)<br>`mediterranean/turkey` (sails-there) | `mediterranean/greece/athens`<br>`mediterranean/greece/the-cyclades` |
| Dubrovnik to Trogir | `/mediterranean/dubrovnik-to-trogir/` | `mediterranean/croatia` (link, sails-there)<br>`mediterranean/croatia/dubrovnik` (link, sails-there)<br>`mediterranean/croatia/hvar` (link, sails-there)<br>`mediterranean/montenegro` (sails-there)<br>`mediterranean/montenegro/budva` (link, sails-there)<br>`mediterranean/montenegro/kotor` (link, sails-there) | `mediterranean`<br>`mediterranean/croatia`<br>`mediterranean/croatia/dubrovnik`<br>`mediterranean/croatia/hvar`<br>`mediterranean/montenegro/budva`<br>`mediterranean/montenegro/kotor` |
| East Greenland | `/arctic/east-greenland/` | `arctic/east-greenland` (link, sails-there) | `arctic/east-greenland` |
| Eden Island to Fregate Island, Seychelles | `/indian-ocean/eden-island-to-fregate-island-seychelles/` | `indian-ocean/seychelles` (link, sails-there) | `indian-ocean/seychelles` |
| Fiji Itinerary | `/south-pacific/fiji-itinerary/` | `south-pacific/fiji` (link, sails-there) | `south-pacific/fiji` |
| Gocek to Gocek | `/mediterranean/gocek-to-gocek/` | `mediterranean/greece/the-dodecanese` (sails-there)<br>`mediterranean/turkey` (link, sails-there)<br>`mediterranean/turkey/gocek` (link, sails-there)<br>`mediterranean/turkey/marmaris` (link, sails-there) | `mediterranean`<br>`mediterranean/turkey`<br>`mediterranean/turkey/gocek`<br>`mediterranean/turkey/marmaris` |
| la paz to la paz | `/central-america/la-paz-to-la-paz/` | `central-america/mexico` (link) | `central-america/mexico` |
| Langkawi to Phuket | `/indian-ocean/luxury-7-day-yacht-itinerary-langkawi-to-phuket-exploration-ocean-independence/` | `south-east-asia/indonesia` (link)<br>`south-east-asia/malaysia` (link)<br>`south-east-asia/thailand` (link, sails-there) | `south-east-asia/indonesia`<br>`south-east-asia/malaysia`<br>`south-east-asia/thailand` |
| Longyearbyen to Longyearbyen | `/arctic/longyearbyen-to-longyearbyen/` | `arctic/svalbard` (link, sails-there) | `arctic/svalbard` |
| Male to Male | `/indian-ocean/male-to-male/` | `indian-ocean/maldives` (link, sails-there) | `indian-ocean/maldives` |
| Naples to Sicily | `/mediterranean/naples-to-sicily/` | `mediterranean/italy/amalfi-coast` (link, sails-there)<br>`mediterranean/italy/amalfi-coast/amalfi` (sails-there)<br>`mediterranean/italy/amalfi-coast/capri` (link, sails-there)<br>`mediterranean/italy/amalfi-coast/positano` (sails-there)<br>`mediterranean/italy/ischia` (link, sails-there)<br>`mediterranean/italy/italian-riviera/lerici` (link)<br>`mediterranean/italy/naples` (sails-there)<br>`mediterranean/italy/sicily` (link, sails-there)<br>`mediterranean/italy/sicily/aeolian-islands` (sails-there)<br>`mediterranean/malta` (sails-there) | `mediterranean/italy/amalfi-coast`<br>`mediterranean/italy/amalfi-coast/capri`<br>`mediterranean/italy/ischia`<br>`mediterranean/italy/italian-riviera/lerici`<br>`mediterranean/italy/sicily` |
| Nassau to Nassau | `/caribbean/nassau-to-nassau/` | `caribbean` (link)<br>`caribbean/the-bahamas` (link, sails-there)<br>`caribbean/the-bahamas/abaco-islands` (link)<br>`caribbean/the-bahamas/bimini-islands` (link)<br>`caribbean/the-bahamas/grand-bahama` (link)<br>`caribbean/the-bahamas/nassau` (link, sails-there)<br>`caribbean/the-bahamas/the-exumas` (link, sails-there) | `caribbean`<br>`caribbean/the-bahamas`<br>`caribbean/the-bahamas/abaco-islands`<br>`caribbean/the-bahamas/bimini-islands`<br>`caribbean/the-bahamas/grand-bahama`<br>`caribbean/the-bahamas/nassau`<br>`caribbean/the-bahamas/the-exumas` |
| New England | `/north-america/new-england/` | `north-america/new-england` (link, sails-there) | `north-america/new-england` |
| Palma to Cala Morell | `/mediterranean/palma-to-cala-morell/` | `mediterranean/spain` (link, sails-there)<br>`mediterranean/spain/the-balearics` (link, sails-there)<br>`mediterranean/spain/the-balearics/formentera` (link, sails-there)<br>`mediterranean/spain/the-balearics/ibiza` (link, sails-there)<br>`mediterranean/spain/the-balearics/mallorca` (link, sails-there)<br>`mediterranean/spain/the-balearics/menorca` (link, sails-there)<br>`mediterranean/spain/valencia` (sails-there) | `mediterranean/spain`<br>`mediterranean/spain/the-balearics`<br>`mediterranean/spain/the-balearics/formentera`<br>`mediterranean/spain/the-balearics/ibiza`<br>`mediterranean/spain/the-balearics/mallorca`<br>`mediterranean/spain/the-balearics/menorca` |
| panama to costa rica | `/central-america/panama-to-costa-rica/` | `central-america/costa-rica` (link, sails-there) | `central-america/costa-rica` |
| Patagonia Itinerary | `/south-america/patagonia-itinerary/` | — *not drawable, fewer than two located places* | `south-america/patagonia` |
| Rhodes to Bodrum | `/mediterranean/rhodes-to-bodrum/` | `mediterranean/greece/the-dodecanese` (link, sails-there)<br>`mediterranean/turkey` (sails-there)<br>`mediterranean/turkey/gocek` (sails-there)<br>`mediterranean/turkey/marmaris` (sails-there) | `mediterranean/greece/the-dodecanese` |
| Rome to Naples | `/mediterranean/rome-to-naples/` | `mediterranean` (link)<br>`mediterranean/italy` (link, sails-there)<br>`mediterranean/italy/amalfi-coast` (sails-there)<br>`mediterranean/italy/amalfi-coast/amalfi` (link, sails-there)<br>`mediterranean/italy/amalfi-coast/capri` (sails-there)<br>`mediterranean/italy/amalfi-coast/positano` (link, sails-there)<br>`mediterranean/italy/ischia` (sails-there)<br>`mediterranean/italy/naples` (link, sails-there)<br>`mediterranean/italy/naples/pontine-islands` (link) | `mediterranean`<br>`mediterranean/italy`<br>`mediterranean/italy/amalfi-coast/amalfi`<br>`mediterranean/italy/amalfi-coast/positano`<br>`mediterranean/italy/naples`<br>`mediterranean/italy/naples/pontine-islands` |
| Sitka to Juneau, Alaska | `/north-america/sitka-to-juneau-alaska/` | `north-america/alaska` (link, sails-there) | `north-america/alaska` |
| St Maarten to St Maarten | `/caribbean/st-maarten-to-st-maarten/` | `caribbean` (link)<br>`caribbean/leeward-islands` (link, sails-there)<br>`caribbean/leeward-islands/antigua` (sails-there)<br>`caribbean/leeward-islands/st-barts` (link, sails-there)<br>`caribbean/leeward-islands/st-maarten` (link, sails-there)<br>`caribbean/the-windward-islands/st-vincent-the-grenadines/martinique` (link)<br>`caribbean/virgin-islands` (sails-there) | `caribbean`<br>`caribbean/leeward-islands`<br>`caribbean/leeward-islands/st-barts`<br>`caribbean/leeward-islands/st-maarten`<br>`caribbean/the-windward-islands/st-vincent-the-grenadines/martinique` |
| St. Thomas to St. Thomas | `/caribbean/st-thomas-to-st-thomas/` | `caribbean/virgin-islands` (sails-there)<br>`caribbean/virgin-islands/british-virgin-islands` (sails-there)<br>`caribbean/virgin-islands/us-virgin-islands` (link, sails-there) | `caribbean`<br>`caribbean/virgin-islands/us-virgin-islands` |
| Stavanger to Bergen | `/northern-europe/stavanger-to-bergen/` | `northern-europe/norway` (link, sails-there) | `northern-europe/norway` |
| The Florida Keys | `/north-america/the-florida-keys/` | `caribbean/the-bahamas` (sails-there)<br>`caribbean/the-bahamas/bimini-islands` (sails-there)<br>`north-america/florida` (link, sails-there) | `north-america/florida` |
| The Kimberley | `/australasia/the-kimberley/` | `australia-and-new-zealand/australia` (link)<br>`australia-and-new-zealand/australia/the-kimberley` (link) | `australia-and-new-zealand/australia`<br>`australia-and-new-zealand/australia/the-kimberley` |
| Tortola to Tortola | `/caribbean/tortola-to-tortola/` | `caribbean/virgin-islands` (sails-there)<br>`caribbean/virgin-islands/british-virgin-islands` (link, sails-there)<br>`caribbean/virgin-islands/us-virgin-islands` (sails-there) | `caribbean`<br>`caribbean/virgin-islands/british-virgin-islands` |

Mapped itineraries: 31 of 32. Destinations per itinerary: minimum 1, median 3, maximum 12 (Cannes to Monaco).

## 2. Destination view

All 125 destinations, grouped by top-level region in the website's own region order, depth-first within each.
**No itinerary** marks the 34 destinations that show none.

### Mediterranean

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `mediterranean` | 1 | — | Rome to Naples (link)<br>Cannes to Monaco (link)<br>calvi to cala di volpe (link) |
| `mediterranean/croatia` | 2 | `mediterranean` | Dubrovnik to Trogir (link, sails-there) |
| `mediterranean/croatia/dubrovnik` | 3 | `mediterranean/croatia` | Dubrovnik to Trogir (link, sails-there) |
| `mediterranean/croatia/hvar` | 3 | `mediterranean/croatia` | Dubrovnik to Trogir (link, sails-there) |
| `mediterranean/cyprus` | 2 | `mediterranean` | **No itinerary** |
| `mediterranean/cyprus/limassol` | 3 | `mediterranean/cyprus` | **No itinerary** |
| `mediterranean/france` | 2 | `mediterranean` | Cannes to Monaco (link, sails-there)<br>calvi to cala di volpe (sails-there) |
| `mediterranean/france/corsica` | 3 | `mediterranean/france` | calvi to cala di volpe (sails-there) |
| `mediterranean/france/corsica/calvi` | 4 | `mediterranean/france/corsica` | calvi to cala di volpe (sails-there) |
| `mediterranean/france/french-riviera` | 3 | `mediterranean/france` | Cannes to Monaco (link, sails-there) |
| `mediterranean/france/french-riviera/antibes` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link, sails-there) |
| `mediterranean/france/french-riviera/cannes` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link, sails-there) |
| `mediterranean/france/french-riviera/cap-ferrat` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link, sails-there) |
| `mediterranean/france/french-riviera/eze` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link, sails-there) |
| `mediterranean/france/french-riviera/monaco` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link, sails-there) |
| `mediterranean/france/french-riviera/st-tropez` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link, sails-there) |
| `mediterranean/france/french-riviera/porquerolles` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link) |
| `mediterranean/france/french-riviera/villefranche` | 4 | `mediterranean/france/french-riviera` | Cannes to Monaco (link, sails-there) |
| `mediterranean/greece` | 2 | `mediterranean` | corfu to zakynthos (sails-there)<br>Cyclades Itinerary (sails-there) |
| `mediterranean/greece/athens` | 3 | `mediterranean/greece` | Cyclades Itinerary (link, sails-there) |
| `mediterranean/greece/crete` | 3 | `mediterranean/greece` | Cyclades Itinerary (sails-there) |
| `mediterranean/greece/the-cyclades` | 3 | `mediterranean/greece` | Cyclades Itinerary (link, sails-there) |
| `mediterranean/greece/the-cyclades/mykonos` | 4 | `mediterranean/greece/the-cyclades` | Cyclades Itinerary (inherited, sails-there) |
| `mediterranean/greece/the-cyclades/santorini` | 4 | `mediterranean/greece/the-cyclades` | Cyclades Itinerary (inherited, sails-there) |
| `mediterranean/greece/the-dodecanese` | 3 | `mediterranean/greece` | Rhodes to Bodrum (link, sails-there)<br>Gocek to Gocek (sails-there) |
| `mediterranean/greece/the-ionian-islands` | 3 | `mediterranean/greece` | Bay of Islands (link)<br>corfu to zakynthos (sails-there) |
| `mediterranean/greece/the-ionian-islands/corfu` | 4 | `mediterranean/greece/the-ionian-islands` | corfu to zakynthos (link, sails-there) |
| `mediterranean/greece/the-ionian-islands/zakynthos` | 4 | `mediterranean/greece/the-ionian-islands` | corfu to zakynthos (link, sails-there) |
| `mediterranean/greece/the-saronic-islands` | 3 | `mediterranean/greece` | Cyclades Itinerary (sails-there) |
| `mediterranean/greece/the-saronic-islands/hydra` | 4 | `mediterranean/greece/the-saronic-islands` | **No itinerary** |
| `mediterranean/greece/the-saronic-islands/spetses` | 4 | `mediterranean/greece/the-saronic-islands` | **No itinerary** |
| `mediterranean/italy` | 2 | `mediterranean` | Rome to Naples (link, sails-there)<br>calvi to cala di volpe (sails-there) |
| `mediterranean/italy/amalfi-coast` | 3 | `mediterranean/italy` | Naples to Sicily (link, sails-there)<br>Rome to Naples (sails-there) |
| `mediterranean/italy/amalfi-coast/amalfi` | 4 | `mediterranean/italy/amalfi-coast` | Rome to Naples (link, sails-there)<br>Naples to Sicily (sails-there) |
| `mediterranean/italy/amalfi-coast/capri` | 4 | `mediterranean/italy/amalfi-coast` | Naples to Sicily (link, sails-there)<br>Rome to Naples (sails-there) |
| `mediterranean/italy/amalfi-coast/positano` | 4 | `mediterranean/italy/amalfi-coast` | Rome to Naples (link, sails-there)<br>Naples to Sicily (sails-there) |
| `mediterranean/italy/bari` | 3 | `mediterranean/italy` | **No itinerary** |
| `mediterranean/italy/ischia` | 3 | `mediterranean/italy` | Naples to Sicily (link, sails-there)<br>Rome to Naples (sails-there) |
| `mediterranean/italy/italian-riviera` | 3 | `mediterranean/italy` | Cannes to Monaco (sails-there) |
| `mediterranean/italy/italian-riviera/cinque-terre` | 4 | `mediterranean/italy/italian-riviera` | **No itinerary** |
| `mediterranean/italy/italian-riviera/genoa` | 4 | `mediterranean/italy/italian-riviera` | **No itinerary** |
| `mediterranean/italy/italian-riviera/lerici` | 4 | `mediterranean/italy/italian-riviera` | Naples to Sicily (link) |
| `mediterranean/italy/italian-riviera/portofino` | 4 | `mediterranean/italy/italian-riviera` | **No itinerary** |
| `mediterranean/italy/naples` | 3 | `mediterranean/italy` | Rome to Naples (link, sails-there)<br>Naples to Sicily (sails-there) |
| `mediterranean/italy/naples/pontine-islands` | 4 | `mediterranean/italy/naples` | Rome to Naples (link) |
| `mediterranean/italy/ravenna` | 3 | `mediterranean/italy` | **No itinerary** |
| `mediterranean/italy/sardinia` | 3 | `mediterranean/italy` | calvi to cala di volpe (sails-there) |
| `mediterranean/italy/sardinia/olbia` | 4 | `mediterranean/italy/sardinia` | calvi to cala di volpe (sails-there) |
| `mediterranean/italy/sicily` | 3 | `mediterranean/italy` | Naples to Sicily (link, sails-there)<br>Aeolian Islands: Catania to Palermo (sails-there) |
| `mediterranean/italy/sicily/aeolian-islands` | 4 | `mediterranean/italy/sicily` | Aeolian Islands: Catania to Palermo (link, sails-there)<br>Naples to Sicily (sails-there) |
| `mediterranean/italy/venice` | 3 | `mediterranean/italy` | **No itinerary** |
| `mediterranean/malta` | 2 | `mediterranean` | Aeolian Islands: Catania to Palermo (sails-there)<br>Naples to Sicily (sails-there) |
| `mediterranean/montenegro` | 2 | `mediterranean` | Dubrovnik to Trogir (sails-there) |
| `mediterranean/montenegro/budva` | 3 | `mediterranean/montenegro` | Dubrovnik to Trogir (link, sails-there) |
| `mediterranean/montenegro/kotor` | 3 | `mediterranean/montenegro` | Dubrovnik to Trogir (link, sails-there) |
| `mediterranean/spain` | 2 | `mediterranean` | Palma to Cala Morell (link, sails-there) |
| `mediterranean/spain/the-balearics` | 3 | `mediterranean/spain` | Palma to Cala Morell (link, sails-there) |
| `mediterranean/spain/the-balearics/formentera` | 4 | `mediterranean/spain/the-balearics` | Palma to Cala Morell (link, sails-there) |
| `mediterranean/spain/the-balearics/ibiza` | 4 | `mediterranean/spain/the-balearics` | Palma to Cala Morell (link, sails-there) |
| `mediterranean/spain/the-balearics/mallorca` | 4 | `mediterranean/spain/the-balearics` | Palma to Cala Morell (link, sails-there) |
| `mediterranean/spain/the-balearics/menorca` | 4 | `mediterranean/spain/the-balearics` | Palma to Cala Morell (link, sails-there) |
| `mediterranean/spain/valencia` | 3 | `mediterranean/spain` | Palma to Cala Morell (sails-there) |
| `mediterranean/turkey` | 2 | `mediterranean` | Gocek to Gocek (link, sails-there)<br>Rhodes to Bodrum (sails-there)<br>Cyclades Itinerary (sails-there) |
| `mediterranean/turkey/gocek` | 3 | `mediterranean/turkey` | Gocek to Gocek (link, sails-there)<br>Rhodes to Bodrum (sails-there) |
| `mediterranean/turkey/marmaris` | 3 | `mediterranean/turkey` | Gocek to Gocek (link, sails-there)<br>Rhodes to Bodrum (sails-there) |

### Caribbean

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `caribbean` | 1 | — | antigua to st lucia (link)<br>Nassau to Nassau (link)<br>St Maarten to St Maarten (link) |
| `caribbean/the-bahamas` | 2 | `caribbean` | Nassau to Nassau (link, sails-there)<br>The Florida Keys (sails-there) |
| `caribbean/the-bahamas/abaco-islands` | 3 | `caribbean/the-bahamas` | Nassau to Nassau (link) |
| `caribbean/the-bahamas/bimini-islands` | 3 | `caribbean/the-bahamas` | Nassau to Nassau (link)<br>The Florida Keys (sails-there) |
| `caribbean/the-bahamas/grand-bahama` | 3 | `caribbean/the-bahamas` | Nassau to Nassau (link) |
| `caribbean/the-bahamas/nassau` | 3 | `caribbean/the-bahamas` | Nassau to Nassau (link, sails-there) |
| `caribbean/the-bahamas/the-exumas` | 3 | `caribbean/the-bahamas` | Nassau to Nassau (link, sails-there) |
| `caribbean/leeward-islands` | 2 | `caribbean` | St Maarten to St Maarten (link, sails-there)<br>antigua to st lucia (sails-there) |
| `caribbean/leeward-islands/antigua` | 3 | `caribbean/leeward-islands` | antigua to st lucia (link, sails-there)<br>St Maarten to St Maarten (sails-there) |
| `caribbean/leeward-islands/st-barts` | 3 | `caribbean/leeward-islands` | St Maarten to St Maarten (link, sails-there) |
| `caribbean/leeward-islands/st-maarten` | 3 | `caribbean/leeward-islands` | St Maarten to St Maarten (link, sails-there) |
| `caribbean/the-windward-islands` | 2 | `caribbean` | antigua to st lucia (sails-there) |
| `caribbean/the-windward-islands/st-vincent-the-grenadines` | 3 | `caribbean/the-windward-islands` | antigua to st lucia (sails-there) |
| `caribbean/the-windward-islands/st-vincent-the-grenadines/dominica` | 4 | `caribbean/the-windward-islands/st-vincent-the-grenadines` | antigua to st lucia (sails-there) |
| `caribbean/the-windward-islands/st-vincent-the-grenadines/martinique` | 4 | `caribbean/the-windward-islands/st-vincent-the-grenadines` | St Maarten to St Maarten (link)<br>antigua to st lucia (sails-there) |
| `caribbean/virgin-islands` | 2 | `caribbean` | Tortola to Tortola (sails-there)<br>St Maarten to St Maarten (sails-there)<br>St. Thomas to St. Thomas (sails-there) |
| `caribbean/virgin-islands/british-virgin-islands` | 3 | `caribbean/virgin-islands` | Tortola to Tortola (link, sails-there)<br>St. Thomas to St. Thomas (sails-there) |
| `caribbean/virgin-islands/us-virgin-islands` | 3 | `caribbean/virgin-islands` | St. Thomas to St. Thomas (link, sails-there)<br>Tortola to Tortola (sails-there) |

### North America

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `north-america` | 1 | — | **No itinerary** |
| `north-america/alaska` | 2 | `north-america` | Sitka to Juneau, Alaska (link, sails-there) |
| `north-america/bermuda` | 2 | `north-america` | **No itinerary** |
| `north-america/florida` | 2 | `north-america` | The Florida Keys (link, sails-there) |
| `north-america/new-england` | 2 | `north-america` | New England (link, sails-there) |

### Indian Ocean

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `indian-ocean` | 1 | — | **No itinerary** |
| `indian-ocean/seychelles` | 2 | `indian-ocean` | Eden Island to Fregate Island, Seychelles (link, sails-there) |
| `indian-ocean/tanzania` | 2 | `indian-ocean` | **No itinerary** |
| `indian-ocean/maldives` | 2 | `indian-ocean` | Male to Male (link, sails-there) |

### South East Asia

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `south-east-asia` | 1 | — | **No itinerary** |
| `south-east-asia/indonesia` | 2 | `south-east-asia` | Langkawi to Phuket (link) |
| `south-east-asia/malaysia` | 2 | `south-east-asia` | Langkawi to Phuket (link) |
| `south-east-asia/thailand` | 2 | `south-east-asia` | Langkawi to Phuket (link, sails-there) |

### Australia & New Zealand

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `australia-and-new-zealand` | 1 | — | **No itinerary** |
| `australia-and-new-zealand/australia` | 2 | `australia-and-new-zealand` | The Kimberley (link) |
| `australia-and-new-zealand/australia/the-great-barrier-reef` | 3 | `australia-and-new-zealand/australia` | **No itinerary** |
| `australia-and-new-zealand/australia/the-kimberley` | 3 | `australia-and-new-zealand/australia` | The Kimberley (link) |
| `australia-and-new-zealand/australia/the-whitsundays` | 3 | `australia-and-new-zealand/australia` | **No itinerary** |
| `australia-and-new-zealand/new-zealand` | 2 | `australia-and-new-zealand` | Bay of Islands (link) |

### South Pacific

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `south-pacific` | 1 | — | **No itinerary** |
| `south-pacific/fiji` | 2 | `south-pacific` | Fiji Itinerary (link, sails-there) |
| `south-pacific/french-polynesia` | 2 | `south-pacific` | **No itinerary** |
| `south-pacific/new-caledonia` | 2 | `south-pacific` | **No itinerary** |

### South America

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `south-america` | 1 | — | **No itinerary** |
| `south-america/chile` | 2 | `south-america` | **No itinerary** |
| `south-america/ecuador` | 2 | `south-america` | **No itinerary** |
| `south-america/ecuador/galapagos-islands` | 3 | `south-america/ecuador` | **No itinerary** |
| `south-america/patagonia` | 2 | `south-america` | **No itinerary** |

### Central America

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `central-america` | 1 | — | **No itinerary** |
| `central-america/belize` | 2 | `central-america` | **No itinerary** |
| `central-america/costa-rica` | 2 | `central-america` | panama to costa rica (link, sails-there) |
| `central-america/mexico` | 2 | `central-america` | la paz to la paz (link) |

### Northern Europe

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `northern-europe` | 1 | — | **No itinerary** |
| `northern-europe/norway` | 2 | `northern-europe` | Stavanger to Bergen (link, sails-there) |

### arctic

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `arctic` | 1 | — | **No itinerary** |
| `arctic/east-greenland` | 2 | `arctic` | East Greenland (link, sails-there) |
| `arctic/svalbard` | 2 | `arctic` | Longyearbyen to Longyearbyen (link, sails-there) |

### Middle East

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `middle-east` | 1 | — | **No itinerary** |
| `middle-east/the-red-sea` | 2 | `middle-east` | **No itinerary** |

### Antarctica

| Destination | Level | Parent | Itineraries shown (rule) |
|---|---|---|---|
| `antarctica` | 1 | — | **No itinerary** |
| `antarctica/antarctica` | 2 | `antarctica` | Antarctica Itinerary (link) |

### Outside the region tree

These records are not reachable from any region in the website's `regionOrder` — their parent or their region
has no record in the snapshot. They are left over from an earlier site structure and are reported here so the
count reconciles.

| Destination | Level | Parent | Region id | Itineraries shown (rule) |
|---|---|---|---|---|
| `australasia/australia/the-great-barrier-reef` | 3 | `australasia/australia` *(no record)* | `australasia` *(no record)* | **No itinerary** |

Destinations with at least one itinerary: 91. Without: 34.
## 3. Suspect assignments

Four tests, applied to every mapping that is shown. A mapping can fail more than one.

| Test | What it looks for |
|---|---|
| **A** | The itinerary and the destination sit under different top-level regions. |
| **B** | The mapping comes only from sails-there, and neither the destination nor any ancestor up to its region links to the itinerary. |
| **C** | A country or region (level 1 or 2) picked the itinerary up by inheritance. |
| **D** | The two days that satisfy sails-there rest on hand-corrected or flagged coordinates. |

20 of 122 shown mappings fail at least one test.

| Destination | Level | Itinerary | Rule(s) | Test | Why |
|---|---|---|---|---|---|
| `caribbean/the-bahamas` | 2 | The Florida Keys | sails-there | A, B | destination region `caribbean`; itinerary's home region(s) `north-america`; 3 day(s) inside the 260 km radius; no page from `caribbean/the-bahamas` up to its region links to it |
| `caribbean/the-bahamas/bimini-islands` | 3 | The Florida Keys | sails-there | A, B | destination region `caribbean`; itinerary's home region(s) `north-america`; 3 day(s) inside the 150 km radius; no page from `caribbean/the-bahamas/bimini-islands` up to its region links to it |
| `mediterranean/greece` | 2 | Cyclades Itinerary | sails-there | B | 3 day(s) inside the 260 km radius; no page from `mediterranean/greece` up to its region links to it |
| `mediterranean/greece/crete` | 3 | Cyclades Itinerary | sails-there | B | 2 day(s) inside the 150 km radius; no page from `mediterranean/greece/crete` up to its region links to it |
| `mediterranean/greece/the-saronic-islands` | 3 | Cyclades Itinerary | sails-there | B | 5 day(s) inside the 150 km radius; no page from `mediterranean/greece/the-saronic-islands` up to its region links to it |
| `mediterranean/italy/naples` | 3 | Naples to Sicily | sails-there | B | 4 day(s) inside the 150 km radius; no page from `mediterranean/italy/naples` up to its region links to it |
| `mediterranean/italy/sicily` | 3 | Aeolian Islands: Catania to Palermo | sails-there | B | 8 day(s) inside the 150 km radius; no page from `mediterranean/italy/sicily` up to its region links to it |
| `mediterranean/malta` | 2 | Aeolian Islands: Catania to Palermo | sails-there | B | 2 day(s) inside the 260 km radius; no page from `mediterranean/malta` up to its region links to it |
| `mediterranean/turkey` | 2 | Rhodes to Bodrum | sails-there | B | 8 day(s) inside the 260 km radius; no page from `mediterranean/turkey` up to its region links to it |
| `mediterranean/turkey` | 2 | Cyclades Itinerary | sails-there | B | 2 day(s) inside the 260 km radius; no page from `mediterranean/turkey` up to its region links to it |
| `mediterranean/turkey/gocek` | 3 | Rhodes to Bodrum | sails-there | B | 5 day(s) inside the 150 km radius; no page from `mediterranean/turkey/gocek` up to its region links to it |
| `mediterranean/turkey/marmaris` | 3 | Rhodes to Bodrum | sails-there | B | 8 day(s) inside the 150 km radius; no page from `mediterranean/turkey/marmaris` up to its region links to it |
| `mediterranean/malta` | 2 | Naples to Sicily | sails-there | B, D | 2 day(s) inside the 260 km radius; no page from `mediterranean/malta` up to its region links to it; only 1 qualifying day(s) survive without the flagged and hand-corrected points |
| `mediterranean/france` | 2 | calvi to cala di volpe | sails-there | D | only 1 qualifying day(s) survive without the flagged and hand-corrected points |
| `mediterranean/greece/the-cyclades/mykonos` | 4 | Cyclades Itinerary | inherited, sails-there | D | only 1 qualifying day(s) survive without the flagged and hand-corrected points |
| `mediterranean/greece/the-dodecanese` | 3 | Gocek to Gocek | sails-there | D | only 1 qualifying day(s) survive without the flagged and hand-corrected points |
| `mediterranean/greece/the-ionian-islands` | 3 | corfu to zakynthos | sails-there | D | only 1 qualifying day(s) survive without the flagged and hand-corrected points |
| `mediterranean/greece/the-ionian-islands/zakynthos` | 4 | corfu to zakynthos | link, sails-there | D | only 0 qualifying day(s) survive without the flagged and hand-corrected points |
| `mediterranean/italy/amalfi-coast` | 3 | Naples to Sicily | link, sails-there | D | only 1 qualifying day(s) survive without the flagged and hand-corrected points |
| `mediterranean/spain/valencia` | 3 | Palma to Cala Morell | sails-there | D | only 0 qualifying day(s) survive without the hand-corrected points |

Counts by test: **A** 2, **B** 13, **C** 0, **D** 8.

Two readings of test B are worth separating, and the table does not do it for you. Some of these are plainly
false — Malta showing a Naples-to-Sicily route on the strength of two days — while others are places the route
genuinely spends a week in and the website's editors simply never linked: the Aeolian Islands itinerary sits on
Sicily with eight of its nine days inside the radius, and Rhodes to Bodrum sits on Marmaris with eight. Test B
measures the departure from the site's editorial choice, not whether the route is there.

Test D is informational on two rows: `…/zakynthos` and `…/amalfi-coast` also fire the link rule, so they would
be shown whatever the coordinates said. On the other six, the coordinates are the whole reason the mapping
exists.

**Test C returns nothing, by construction.** `linksFor()` only inherits when the destination is level 4 or
deeper, and stops walking at level 3, so a country or region can never take an itinerary from a leaf. Every
level 1 or 2 destination in this data holds itineraries either from its own page or from sails-there.

### The Bahamas and The Florida Keys

`caribbean/the-bahamas` (level 2, radius **260 km**, centred 25.1744, -78.0256) shows **The Florida Keys** by **sails-there** alone. The website's Bahamas page links only to Nassau to Nassau.

The days that satisfy the rule:

| Day | Located place | Distance from the Bahamas centre | Coordinate source |
|---|---|---|---|
| 1 | biscayne bay | 234 km | map-pin |
| 1 | south beach | 222 km | nominatim |
| 3 | key largo | 246 km | nominatim |
| 7 | miami | 228 km | nominatim |

Two days inside 260 km is the whole of the evidence, and both are Florida landfalls: the itinerary never
enters Bahamian waters. It is a false match caused by the country radius (§4), not by a bad coordinate.

## 4. Radius

The radius is **fixed per level**, hard-coded in `scripts/build-itineraries.mjs`. It is not per record and does
not come from the website; no destination carries a radius, an extent or a bounding box in the snapshot, so a
single point (the destination's own pin) plus a level constant is all the rule has to work with.

```js
const NEAR_KM = { 1: 0, 2: 260, 3: 150, 4: 60 };   // km, by destination level
const NEAR_MIN_STOPS = 2;                         // days that must fall inside it
```

Level 1 is 0, so a region never matches by sails-there; it only ever shows what its own page links to.

Radius for every destination named in the suspect list:

| Destination | Level | Radius | Centre |
|---|---|---|---|
| `caribbean/the-bahamas` | 2 | 260 km | 25.1744, -78.0256 |
| `caribbean/the-bahamas/bimini-islands` | 3 | 150 km | 25.7471, -79.2814 |
| `mediterranean/france` | 2 | 260 km | 43.3, 6.8 |
| `mediterranean/greece` | 2 | 260 km | 39.3797, 22.5678 |
| `mediterranean/greece/crete` | 3 | 150 km | 35.3413, 25.1376 |
| `mediterranean/greece/the-cyclades/mykonos` | 4 | 60 km | 37.4467, 25.3289 |
| `mediterranean/greece/the-dodecanese` | 3 | 150 km | 36.5579, 27.1759 |
| `mediterranean/greece/the-ionian-islands` | 3 | 150 km | 38.3714, 20.6149 |
| `mediterranean/greece/the-ionian-islands/zakynthos` | 4 | 60 km | 37.787, 20.8999 |
| `mediterranean/greece/the-saronic-islands` | 3 | 150 km | 37.7147, 23.4627 |
| `mediterranean/italy/amalfi-coast` | 3 | 150 km | 40.634, 14.6027 |
| `mediterranean/italy/naples` | 3 | 150 km | 40.8414, 14.2694 |
| `mediterranean/italy/sicily` | 3 | 150 km | 38.2681, 15.2344 |
| `mediterranean/malta` | 2 | 260 km | 35.8311, 14.5428 |
| `mediterranean/spain/valencia` | 3 | 150 km | 39.4732, -0.3246 |
| `mediterranean/turkey` | 2 | 260 km | 36.8, 28.3 |
| `mediterranean/turkey/gocek` | 3 | 150 km | 36.753, 28.94 |
| `mediterranean/turkey/marmaris` | 3 | 150 km | 36.8157, 28.2881 |
### Whether the radius is the cause, case by case

| Destination | Radius | Itinerary | Days inside, and how far | Is the radius the cause? |
|---|---|---|---|---|
| `caribbean/the-bahamas` | 260 km | The Florida Keys | d1 biscayne bay 234 km; d1 south beach 222 km; d3 key largo 246 km; d7 miami 228 km | **Yes** — every qualifying place sits 222–246 km out, in the outer band of the radius |
| `caribbean/the-bahamas/bimini-islands` | 150 km | The Florida Keys | d1 biscayne bay 96 km; d1 south beach 85 km; d3 key largo 140 km; d7 miami 91 km | Partly — the nearest qualifying place is 85 km out, so the route does come close |
| `mediterranean/greece` | 260 km | Cyclades Itinerary | d1 athens 186 km; d1 kea 250 km; d2 kea 250 km; d8 athens 186 km | **Yes** — every qualifying place sits 186–250 km out, in the outer band of the radius |
| `mediterranean/greece/crete` | 150 km | Cyclades Itinerary | d4 santorini 121 km; d5 Santorini 121 km | **Yes** — every qualifying place sits 121–121 km out, in the outer band of the radius |
| `mediterranean/greece/the-saronic-islands` | 150 km | Cyclades Itinerary | d1 athens 37 km; d1 kea 77 km; d2 kea 77 km; d2 sifnos 142 km … | Partly — the nearest qualifying place is 37 km out, so the route does come close |
| `mediterranean/italy/naples` | 150 km | Naples to Sicily | d1 naples 15 km; d1 ischia 29 km; d2 ischia 29 km; d2 galli islands 32 km … | Partly — the nearest qualifying place is 15 km out, so the route does come close |
| `mediterranean/italy/sicily` | 150 km | Aeolian Islands: Catania to Palermo | d1 catania 86 km; d2 taormina 47 km; d3 stromboli 58 km; d4 panarea 43 km … | Partly — the nearest qualifying place is 28 km out, so the route does come close |
| `mediterranean/malta` | 260 km | Aeolian Islands: Catania to Palermo | d1 catania 193 km; d2 taormina 234 km | **Yes** — every qualifying place sits 193–234 km out, in the outer band of the radius |
| `mediterranean/turkey` | 260 km | Cyclades Itinerary | d4 santorini 257 km; d5 Santorini 257 km | **Yes** — every qualifying place sits 257–257 km out, in the outer band of the radius |
| `mediterranean/turkey` | 260 km | Rhodes to Bodrum | d1 rhodes 92 km; d2 rhodes 92 km; d2 symi 47 km; d3 symi 47 km … | Partly — the nearest qualifying place is 47 km out, so the route does come close |
| `mediterranean/turkey/gocek` | 150 km | Rhodes to Bodrum | d1 rhodes 134 km; d2 rhodes 134 km; d2 symi 100 km; d3 symi 100 km … | **Yes** — every qualifying place sits 100–141 km out, in the outer band of the radius |
| `mediterranean/turkey/marmaris` | 150 km | Rhodes to Bodrum | d1 rhodes 93 km; d2 rhodes 93 km; d2 symi 47 km; d3 symi 47 km … | Partly — the nearest qualifying place is 47 km out, so the route does come close |
| `mediterranean/malta` | 260 km | Naples to Sicily | d7 taormina 234 km; d8 Taormina 234 km; d8 Catania 193 km | **Yes** — every qualifying place sits 193–234 km out, in the outer band of the radius |
| `mediterranean/france` | 260 km | calvi to cala di volpe | d1 calvi 234 km; d1 girolata 182 km; d2 girolata 182 km; d2 ajaccio 221 km … | **Yes** — every qualifying place sits 182–234 km out, in the outer band of the radius |
| `mediterranean/greece/the-cyclades/mykonos` | 60 km | Cyclades Itinerary | d6 Paros 43 km; d7 paros 43 km; d7 mykonos 0 km; d8 mykonos 0 km | No — the website links it anyway, so the radius only adds evidence |
| `mediterranean/greece/the-dodecanese` | 150 km | Gocek to Gocek | d2 knidos 23 km; d2 datca 49 km; d3 datca 49 km; d3 kadirga 80 km … | Partly — the nearest qualifying place is 23 km out, so the route does come close |
| `mediterranean/greece/the-ionian-islands` | 150 km | corfu to zakynthos | d2 paxos 101 km; d3 paxos 101 km; d3 levkas 52 km; d4 levkas 52 km … | Partly — the nearest qualifying place is 9 km out, so the route does come close |
| `mediterranean/greece/the-ionian-islands/zakynthos` | 60 km | corfu to zakynthos | d6 kefalonia 60 km; d7 kefalonia 60 km; d7 zakynthos 23 km | No — the website links it anyway, so the radius only adds evidence |
| `mediterranean/italy/amalfi-coast` | 150 km | Naples to Sicily | d1 naples 50 km; d1 ischia 56 km; d2 ischia 56 km; d2 galli islands 16 km … | No — the website links it anyway, so the radius only adds evidence |
| `mediterranean/spain/valencia` | 150 km | Palma to Cala Morell | d4 isla es vedra 148 km; d5 isla es vedra 148 km | **Yes** — every qualifying place sits 148–148 km out, in the outer band of the radius |

## 5. Cap behaviour

### Destinations per itinerary — no cap exists

`MAX_PER_DESTINATION` caps the itineraries shown **on** a destination. Nothing caps how many destinations an
itinerary appears on, so no itinerary-to-destination mapping is dropped by a cap. For reference, the spread:

| Itinerary | Destinations it appears on |
|---|---:|
| Cannes to Monaco | 12 |
| Naples to Sicily | 10 |
| Rome to Naples | 9 |
| Cyclades Itinerary | 8 |
| antigua to st lucia | 7 |
| calvi to cala di volpe | 7 |
| Nassau to Nassau | 7 |
| Palma to Cala Morell | 7 |
| St Maarten to St Maarten | 7 |
| Dubrovnik to Trogir | 6 |
| corfu to zakynthos | 4 |
| Gocek to Gocek | 4 |
| Rhodes to Bodrum | 4 |
| Aeolian Islands: Catania to Palermo | 3 |
| Langkawi to Phuket | 3 |
| St. Thomas to St. Thomas | 3 |
| The Florida Keys | 3 |
| Tortola to Tortola | 3 |
| Bay of Islands | 2 |
| The Kimberley | 2 |
| Antarctica Itinerary | 1 |
| East Greenland | 1 |
| Eden Island to Fregate Island, Seychelles | 1 |
| Fiji Itinerary | 1 |
| la paz to la paz | 1 |
| Longyearbyen to Longyearbyen | 1 |
| Male to Male | 1 |
| New England | 1 |
| panama to costa rica | 1 |
| Sitka to Juneau, Alaska | 1 |
| Stavanger to Bergen | 1 |

### Destinations with more candidates than the panel shows

2 destinations had more than three candidates. Candidates are ordered: link or inherited first, in the
order the website lists them, then sails-there by number of qualifying days (descending), ties by title. The
first three are shown; those below are dropped.

| Destination | Shown | Dropped, in order |
|---|---|---|
| `caribbean` | antigua to st lucia (link)<br>Nassau to Nassau (link)<br>St Maarten to St Maarten (link) | St. Thomas to St. Thomas (link)<br>Tortola to Tortola (link) |
| `mediterranean` | Rome to Naples (link)<br>Cannes to Monaco (link)<br>calvi to cala di volpe (link) | Dubrovnik to Trogir (link)<br>Gocek to Gocek (link)<br>corfu to zakynthos (link) |

Both are region pages, and everything dropped is a **link** — the website's own editorial choice, cut by the cap
rather than by any rule in this report. The Mediterranean page links to six itineraries and shows three. That is
a separate question from the sails-there noise, and worth deciding on its own: raise the cap for regions, or
accept that a region shows the first three the website lists.

## 6. Two proposed fixes, not implemented

### a. Rules 1 and 2 only — drop sails-there

Every mapping would come from the website's own editorial choice, plus a place inheriting its cruising ground's links.

**Coverage: 76 of 125 destinations** would show at least one itinerary, against 91 now (-15). Mappings removed: 42. Mappings added: 0.

Removed:

| Destination | Itinerary | Rule it was shown by |
|---|---|---|
| `caribbean/leeward-islands` | antigua to st lucia | sails-there |
| `caribbean/leeward-islands/antigua` | St Maarten to St Maarten | sails-there |
| `caribbean/the-bahamas` | The Florida Keys | sails-there |
| `caribbean/the-bahamas/bimini-islands` | The Florida Keys | sails-there |
| `caribbean/the-windward-islands` | antigua to st lucia | sails-there |
| `caribbean/the-windward-islands/st-vincent-the-grenadines` | antigua to st lucia | sails-there |
| `caribbean/the-windward-islands/st-vincent-the-grenadines/dominica` | antigua to st lucia | sails-there |
| `caribbean/the-windward-islands/st-vincent-the-grenadines/martinique` | antigua to st lucia | sails-there |
| `caribbean/virgin-islands` | St Maarten to St Maarten | sails-there |
| `caribbean/virgin-islands` | St. Thomas to St. Thomas | sails-there |
| `caribbean/virgin-islands` | Tortola to Tortola | sails-there |
| `caribbean/virgin-islands/british-virgin-islands` | St. Thomas to St. Thomas | sails-there |
| `caribbean/virgin-islands/us-virgin-islands` | Tortola to Tortola | sails-there |
| `mediterranean/france` | calvi to cala di volpe | sails-there |
| `mediterranean/france/corsica` | calvi to cala di volpe | sails-there |
| `mediterranean/france/corsica/calvi` | calvi to cala di volpe | sails-there |
| `mediterranean/greece` | corfu to zakynthos | sails-there |
| `mediterranean/greece` | Cyclades Itinerary | sails-there |
| `mediterranean/greece/crete` | Cyclades Itinerary | sails-there |
| `mediterranean/greece/the-dodecanese` | Gocek to Gocek | sails-there |
| `mediterranean/greece/the-ionian-islands` | corfu to zakynthos | sails-there |
| `mediterranean/greece/the-saronic-islands` | Cyclades Itinerary | sails-there |
| `mediterranean/italy` | calvi to cala di volpe | sails-there |
| `mediterranean/italy/amalfi-coast` | Rome to Naples | sails-there |
| `mediterranean/italy/amalfi-coast/amalfi` | Naples to Sicily | sails-there |
| `mediterranean/italy/amalfi-coast/capri` | Rome to Naples | sails-there |
| `mediterranean/italy/amalfi-coast/positano` | Naples to Sicily | sails-there |
| `mediterranean/italy/ischia` | Rome to Naples | sails-there |
| `mediterranean/italy/italian-riviera` | Cannes to Monaco | sails-there |
| `mediterranean/italy/naples` | Naples to Sicily | sails-there |
| `mediterranean/italy/sardinia` | calvi to cala di volpe | sails-there |
| `mediterranean/italy/sardinia/olbia` | calvi to cala di volpe | sails-there |
| `mediterranean/italy/sicily` | Aeolian Islands: Catania to Palermo | sails-there |
| `mediterranean/italy/sicily/aeolian-islands` | Naples to Sicily | sails-there |
| `mediterranean/malta` | Aeolian Islands: Catania to Palermo | sails-there |
| `mediterranean/malta` | Naples to Sicily | sails-there |
| `mediterranean/montenegro` | Dubrovnik to Trogir | sails-there |
| `mediterranean/spain/valencia` | Palma to Cala Morell | sails-there |
| `mediterranean/turkey` | Cyclades Itinerary | sails-there |
| `mediterranean/turkey` | Rhodes to Bodrum | sails-there |
| `mediterranean/turkey/gocek` | Rhodes to Bodrum | sails-there |
| `mediterranean/turkey/marmaris` | Rhodes to Bodrum | sails-there |

Nothing is added: link and inherited candidates are always ordered ahead of sails-there ones, so removing
a sails-there candidate can never promote a link into view.

Destinations that would be left with no itinerary at all (15):

`caribbean/the-windward-islands`, `caribbean/the-windward-islands/st-vincent-the-grenadines`, `caribbean/the-windward-islands/st-vincent-the-grenadines/dominica`, `caribbean/virgin-islands`, `mediterranean/france/corsica`, `mediterranean/france/corsica/calvi`, `mediterranean/greece`, `mediterranean/greece/crete`, `mediterranean/greece/the-saronic-islands`, `mediterranean/italy/italian-riviera`, `mediterranean/italy/sardinia`, `mediterranean/italy/sardinia/olbia`, `mediterranean/malta`, `mediterranean/montenegro`, `mediterranean/spain/valencia`

### b. Keep sails-there, but require a shared top-level region

A sails-there candidate only counts when the destination's region is among the regions of the destinations whose pages link to that itinerary.

**Coverage: 91 of 125 destinations** would show at least one itinerary, against 91 now (+0). Mappings removed: 2. Mappings added: 0.

Removed:

| Destination | Itinerary | Rule it was shown by |
|---|---|---|
| `caribbean/the-bahamas` | The Florida Keys | sails-there |
| `caribbean/the-bahamas/bimini-islands` | The Florida Keys | sails-there |

Nothing is added: no same-region candidate was sitting below the cap behind a cross-region one.
