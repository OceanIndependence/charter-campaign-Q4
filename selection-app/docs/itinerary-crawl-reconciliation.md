# Itinerary crawl reconciliation — what the website currently holds

Branch `claude/tier2-website-itineraries` · 17 September 2026 · a re-crawl and a reconciliation.
The mapping rules, the radius constants and the cap are untouched; no coordinate was corrected by hand in this
pass. The Personalised Atlas is a deterministic web application: every figure below comes from the crawl and
the build, not from a judgement call.

## What was done

The crawl now starts at `/yacht-charter/itineraries/` and takes the region list from that page — **13 regions**,
against the 11 the previous crawl happened to touch. Each region listing page was read and every itinerary card
on it followed. No itinerary URL's region segment was trusted, and the previous URL list was not reused.

All 125 destination pages were re-read for their itinerary links.

Three parser defects were fixed in `src/server/atlas/website.mjs` to capture what the pages actually hold. None
of them touches the mapping rules, the radius or the cap:

| Defect | Effect before | Now |
|---|---|---|
| The `<h1>` carries the length in an `.h5` eyebrow. It was folded into the title, and the day count was read from the combined string. | Worked by accident where the eyebrow read "7 days"; where it reads "Croatia Yacht Charter Itinerary - 7 Days" the title became the whole sentence and the length was lost. | The eyebrow is removed and read for the length. |
| Day headings existed in one format only ("Day One rome"). | A newer template numbering first ("1 Day Split and Maslinica", "8-9 Days Optional Extension") produced no days at all. | Both formats parse. |
| The featured Charter Itinerary block was found by looking for the link inside the heading's own block. | On the newer template the heading and the button are siblings, so the feature was skipped. | The `#itineraries` section is walked in document order; links in body prose are still excluded. |

## 1. Every itinerary now captured

**38 itineraries**, against 32 before. "Listed on" is the region listing page that carried the card.

| Itinerary | Canonical URL | Region listing | Days | Status |
|---|---|---|---|---|
| Aeolian Islands: Catania to Palermo | `/mediterranean/aeolian-islands-catania-to-palermo/` | mediterranean | 9 | unchanged |
| Antarctica Itinerary | `/antarctica/antarctica-itinerary/` | antarctica | 7 | unchanged |
| antigua to st lucia | `/caribbean/antigua-to-st-lucia/` | caribbean | 7 | unchanged |
| Bay of Islands | `/south-pacific/bay-of-islands/` | south-pacific | 8 | unchanged |
| calvi to cala di volpe | `/mediterranean/calvi-to-cala-di-volpe/` | mediterranean | 7 | unchanged |
| Cannes to Monaco | `/mediterranean/cannes-to-monaco/` | mediterranean | 7 | unchanged |
| corfu to zakynthos | `/mediterranean/corfu-to-zakynthos/` | mediterranean | 8 | unchanged |
| Cyclades Itinerary | `/mediterranean/cyclades-itinerary/` | mediterranean | 8 | unchanged |
| Dubai to Abu Dhabi | `/middle-east/dubai-to-abu-dhabi/` | middle-east | 7 | **new** |
| Dubrovnik to Trogir | `/mediterranean/dubrovnik-to-trogir/` | mediterranean | 7 | unchanged |
| East Greenland | `/arctic/east-greenland/` | arctic | 9 | unchanged |
| Eden Island to Fregate Island, Seychelles | `/indian-ocean/eden-island-to-fregate-island-seychelles/` | indian-ocean | 9 | unchanged |
| Fiji Itinerary | `/south-pacific/fiji-itinerary/` | south-pacific | 10 | unchanged |
| Gocek to Gocek | `/mediterranean/gocek-to-gocek/` | mediterranean | 7 | unchanged |
| la paz to la paz | `/central-america/la-paz-to-la-paz/` | central-america | 8 | unchanged |
| Langkawi to Phuket | `/indian-ocean/luxury-7-day-yacht-itinerary-langkawi-to-phuket-exploration-ocean-independence/` | indian-ocean, south-east-asia | 7 | unchanged |
| Longyearbyen to Longyearbyen | `/arctic/longyearbyen-to-longyearbyen/` | arctic | 10 | unchanged |
| Male to Male | `/indian-ocean/male-to-male/` | indian-ocean | 7 | unchanged |
| Marina del Rey to Marina del Rey | `/north-america/california-coast-marina-del-rey-to-marina-del-rey/` | north-america | 7 | **new** |
| monaco to rome | `/mediterranean/monaco-to-rome/` | mediterranean | 9 | **new** |
| Naples to Sicily | `/mediterranean/naples-to-sicily/` | mediterranean | 8 | unchanged |
| Nassau to Nassau | `/caribbean/nassau-to-nassau/` | caribbean | 7 | unchanged |
| New England | `/north-america/new-england/` | north-america | 7 | unchanged |
| Palma to Cala Morell | `/mediterranean/palma-to-cala-morell/` | mediterranean | 9 | unchanged |
| panama to costa rica | `/central-america/panama-to-costa-rica/` | central-america | 8 | unchanged |
| Patagonia Itinerary | `/south-america/patagonia-itinerary/` | south-america | 7 | unchanged |
| Rhodes to Bodrum | `/mediterranean/rhodes-to-bodrum/` | mediterranean | 8 | unchanged |
| Rome to Naples | `/mediterranean/rome-to-naples/` | mediterranean | 7 | unchanged |
| San Juan Islands | `/north-america/san-juan-islands/` | north-america | 8 | **new** |
| Scenic Eclipse in Antarctica | `/antarctica/scenic-eclipse-in-antarctica/` | antarctica | 12 | **new** |
| Sitka to Juneau, Alaska | `/north-america/sitka-to-juneau-alaska/` | north-america | 8 | unchanged |
| Split to Dubrovnik | `/mediterranean/croatia-yacht-charter-itinerary-split-to-dubrovnik/` | mediterranean | 7 | **new** |
| St Maarten to St Maarten | `/caribbean/st-maarten-to-st-maarten/` | caribbean | 8 | unchanged |
| St. Thomas to St. Thomas | `/caribbean/st-thomas-to-st-thomas/` | caribbean | 7 | unchanged |
| Stavanger to Bergen | `/northern-europe/stavanger-to-bergen/` | northern-europe | 7 | unchanged |
| The Florida Keys | `/north-america/the-florida-keys/` | north-america | 7 | unchanged |
| The Kimberley | `/australia-and-new-zealand/the-kimberley/` | australia-and-new-zealand | 7 | **changed URL** (was `australasia/the-kimberley`, a 301) |
| Tortola to Tortola | `/caribbean/tortola-to-tortola/` | caribbean | 10 | unchanged |

Six itineraries are genuinely new and one moved: 7 records in all that the previous crawl did not hold.
All three the review named are present — Split to Dubrovnik, Monaco to Rome, Marina del Rey to Marina del Rey,
San Juan Islands and Dubai to Abu Dhabi — plus one the review had not seen, Scenic Eclipse in Antarctica.
Indian Ocean, Northern Europe, Arctic, Central America, South America and Antarctica were checked as asked:
only Antarctica had anything missing.

## 2. No longer reachable from a region listing

| URL | What it is now |
|---|---|
| `/australasia/the-kimberley/` | **A 301 redirect**, not a dead path: it resolves to `/australia-and-new-zealand/the-kimberley/`. The previous crawl followed it and stored the record under the pre-redirect URL, which is why the id never matched the canonical one. |

Nothing else in the previous crawl has gone. Destination pages still link the pre-redirect Kimberley URL; the
crawl now resolves such a link onto the canonical URL before recording it.

## 3. Destination links, before and after

All 125 pages were read without error. **3 destinations differ**, and only one of them gains an
itinerary:

| Destination | Before | After | Cause |
|---|---|---|---|
| `australia-and-new-zealand/australia` | `australasia/the-kimberley` | `australia-and-new-zealand/the-kimberley` | The Kimberley link resolved onto its canonical URL |
| `australia-and-new-zealand/australia/the-kimberley` | `australasia/the-kimberley` | `australia-and-new-zealand/the-kimberley` | The Kimberley link resolved onto its canonical URL |
| `mediterranean/greece` | — | `mediterranean/rhodes-to-bodrum` | The featured Charter Itinerary block, previously skipped |

**Gained a link: 1** (Greece). **Lost a link: 0.** Destinations carrying at least one link: 75 before, 76 after.

### Is the featured block missed systematically?

**No.** Running the previous parser and the fixed one over the same freshly fetched HTML for all 125 pages, the
two disagree on exactly one page: Greece. Of the 125, 81 carry an `#itineraries` section, the old parser found
links on 75 of them and the fixed parser on 76.

Greece is the one page where the featured block uses the newer template — `<h2>Charter Itinerary</h2>` with
`<h3>Rhodes to Bodrum</h3>` and the button in a sibling wrapper. Every other featured block still has its link
inside the heading's own block, which the old parser could see. So it was a single-page defect, not a
systematic blind spot, though it would have spread as more pages move to the newer template.

One thing the fix deliberately does not do: the Greece page also mentions the Cyclades Itinerary in a sentence
of body copy. That is prose, not an editorial choice, and only links inside `#itineraries` are recorded.

### The six new itineraries are linked from nothing

Not one of the six new itineraries — and not the Kimberley at its canonical URL — is linked from any
destination page. Every one of them can only reach a destination through the sails-there rule, which matters
for §6.
## 4. Coordinate coverage — the seven new records only

Geocoding was re-run without `--refresh`, so every existing entry, including the 31 corrected by hand in the
last pass, is untouched. Only the new day headings were looked up. Nothing here was corrected by hand.

Across the seven: **43 day headings located, 12 not**. No leg over 300 km is drawn on any of them.

### Dubai to Abu Dhabi

`/middle-east/dubai-to-abu-dhabi/` · 7 day headings · 4 located, 3 not · **shown on no destination**

| Day | Heading | Located places | Not located |
|---|---|---|---|
| 1 | arrive in dubai | dubai (map-pin) | — |
| 2 | dubai moon island and sunset cruise | — | dubai moon island (unresolved); sunset cruise (nominatim-far) |
| 3 | dubai world islands cruise and desert safari | desert safari (nominatim) | dubai world islands cruise (unresolved) |
| 4 | explore the city of dubai before a world-class meal at atlantis hotel | — | explore the city of dubai before a world-class meal at atlantis hotel (unresolved) |
| 5 | cruise from dubai to abu dhabi | abu dhabi (map-pin) | cruise from dubai (unresolved) |
| 6 | explore abu dhabi | — | explore abu dhabi (unresolved) |
| 7 | house of artisans and departure from abu dhabi | house of artisans (nominatim) | departure from abu dhabi (unresolved) |

### Marina del Rey to Marina del Rey

`/north-america/california-coast-marina-del-rey-to-marina-del-rey/` · 7 day headings · 6 located, 1 not · **shown on no destination**

| Day | Heading | Located places | Not located |
|---|---|---|---|
| 1 | Marina del Rey to Malibu | Marina del Rey (map-pin); Malibu (map-pin) | — |
| 2 | Malibu to Santa Cruz Island, Channel Islands | Malibu (map-pin); Santa Cruz Island, Channel Islands (map-pin) | — |
| 3 | Santa Cruz Island to Catalina (Two Harbors / Little Geiger Cove) | Santa Cruz Island (map-pin); Little Geiger Cove) (nominatim) | Catalina (Two Harbors (unresolved) |
| 4 | Catalina | Catalina (nominatim) | — |
| 5 | Avalon | Avalon (map-pin) | — |
| 6 | Lover’s Cove | — | Lover’s Cove (nominatim-far) |
| 7 | Catalina to Marina del Rey | Catalina (nominatim); Marina del Rey (map-pin) | — |

### monaco to rome

`/mediterranean/monaco-to-rome/` · 9 day headings · 8 located, 1 not · shown on 8 destination(s)

| Day | Heading | Located places | Not located |
|---|---|---|---|
| 1 | monaco | monaco (map-pin) | — |
| 2 | portofino | portofino (atlas:mediterranean/italy/italian-riviera/portofino) | — |
| 3 | rapallo | rapallo (nominatim) | — |
| 4 | cingue terre | — | cingue terre (unresolved) |
| 5 | portovenere | portovenere (nominatim) | — |
| 6 | forte dei marmi | forte dei marmi (nominatim) | — |
| 7 | elba | elba (nominatim) | — |
| 8 | isola del giglio | isola del giglio (nominatim) | — |
| 9 | rome | rome (map-pin) | — |

### San Juan Islands

`/north-america/san-juan-islands/` · 8 day headings · 8 located, 0 not · **shown on no destination**

| Day | Heading | Located places | Not located |
|---|---|---|---|
| 1 | Anacortes to Orcas Island | Anacortes (map-pin); Orcas Island (map-pin) | — |
| 2 | Orcas Island To Lopez Island | Orcas Island (map-pin); Lopez Island (map-pin) | — |
| 3 | Lopez Island To Friday Harbor | Lopez Island (map-pin); Friday Harbor (map-pin) | — |
| 4 | Friday Harbor and Yellow Island | Friday Harbor (map-pin); Yellow Island (map-pin) | — |
| 5 | Roche Harbor and Spieden Island | Roche Harbor (map-pin); Spieden Island (map-pin) | — |
| 6 | Sucia Island | Sucia Island (map-pin) | — |
| 7 | Lummi Island | Lummi Island (map-pin) | — |
| 8 | Return to Anacortes | Anacortes (map-pin) | — |

### Scenic Eclipse in Antarctica

`/antarctica/scenic-eclipse-in-antarctica/` · 7 day headings · 5 located, 2 not · **shown on no destination**

| Day | Heading | Located places | Not located |
|---|---|---|---|
| 1 | ushuaia | — | ushuaia (nominatim-far) |
| 2–3 | ushuaia to antarctic peninsula | antarctic peninsula (nominatim) | ushuaia (nominatim-far) |
| 4 | antarctic peninsula | antarctic peninsula (nominatim) | — |
| 5–8 | antarctic peninsula | antarctic peninsula (nominatim) | — |
| 9 | antarctic peninsula | antarctic peninsula (nominatim) | — |
| 10–11 | antarctic peninsula to ushuaia | antarctic peninsula (nominatim) | ushuaia (nominatim-far) |
| 12 | ushuaia | — | ushuaia (nominatim-far) |

### Split to Dubrovnik

`/mediterranean/croatia-yacht-charter-itinerary-split-to-dubrovnik/` · 8 day headings · 7 located, 1 not · shown on 6 destination(s)

| Day | Heading | Located places | Not located |
|---|---|---|---|
| 1 | Split and Maslinica | Split (map-pin); Maslinica (map-pin) | — |
| 2 | Maslinica to Vis | Maslinica (map-pin); Vis (map-pin) | — |
| 3 | The Pakleni Islands and Hvar | Hvar (map-pin) | The Pakleni Islands (unresolved) |
| 4 | Hvar to Korčula | Hvar (map-pin); Korčula (map-pin) | — |
| 5 | Korčula to Mljet National Park | Korčula (map-pin); Mljet National Park (map-pin) | — |
| 6 | Mljet to Šipan | Mljet (nominatim); Šipan (map-pin) | — |
| 7 | Šipan to Dubrovnik: Disembark | Šipan (map-pin) | Dubrovnik: Disembark (unresolved) |
| 8–9 | Optional Extension: Montenegro | — | Optional Extension: Montenegro (unresolved) |

### The Kimberley

`/australia-and-new-zealand/the-kimberley/` · 9 day headings · 5 located, 4 not · shown on 2 destination(s)

| Day | Heading | Located places | Not located |
|---|---|---|---|
| 1 | cygnet bay & buccaneer archipelago | cygnet bay (nominatim); buccaneer archipelago (nominatim) | — |
| 2 | king sound to silver gull creek | king sound (nominatim) | silver gull creek (unresolved) |
| 3 | cockatoo island to the horizontal falls | cockatoo island (nominatim) | the horizontal falls (unresolved) |
| 4 | montgomery reef to raft point | montgomery reef (nominatim) | raft point (nominatim-far) |
| 5 | raft point | — | raft point (nominatim-far) |
| 6 | raft point to boondook bay | — | raft point (nominatim-far); boondook bay (unresolved) |
| 7 | boondook bay to cygnet bay | cygnet bay (nominatim) | boondook bay (unresolved) |
| 8 | Felicite Island | — | Felicite Island (nominatim-far) |
| 9 | fregate island | — | fregate island (nominatim-far) |

Four of the seven reach no destination at all. Three of those — Marina del Rey to Marina del Rey, San Juan
Islands and Dubai to Abu Dhabi — sail waters the Atlas has no destination for (California, the Pacific
Northwest, the Gulf). Scenic Eclipse in Antarctica is drawable but its located places do not fall inside the
Antarctica record's radius. None of the four is linked from a destination page either, so they are captured
and invisible.

## 5. The two fix options, restated on the corrected data

Neither is implemented. The figures move because the crawl found six more itineraries and Greece gained a link.

| | Before the re-crawl | After the re-crawl |
|---|---|---|
| Itineraries captured | 32 | 38 |
| Drawable | 31 | 37 |
| Destinations with at least one itinerary | 91 | **94** |
| Mappings shown | 122 | **137** |
| … from link or inherited | 80 | 81 |
| … from sails-there alone | 42 | 56 |

| Option | Coverage | Change against 94 | Mappings removed | Added | Destinations left with none |
|---|---|---|---|---|---|
| **(a)** rules 1 and 2 only | 77 of 125 | -17 | 56 | 0 | 17 |
| **(b)** sails-there must share a region | 91 of 125 | -3 | 16 | 0 | 3 |

The re-crawl changes how these two read.

**(a)** is now more expensive than it was: 56 mappings removed against 42, and 17 destinations left with
nothing against 15. It would also discard all six new itineraries outright, since no destination page links
any of them.

**(b)** has become much less surgical. Before the re-crawl it removed 2 mappings; now it removes 16, and only
2 of those are the cross-region case it was aimed at. The other 14 fall out of the definition: an itinerary
that no destination page links to has no home region, so under (b) it can never be shown anywhere. Those 14
are all Split to Dubrovnik and Monaco to Rome reaching Croatia, Montenegro, the Italian Riviera and the French
coast they genuinely sail — mappings that look right. If (b) is the direction, it needs a rule for itineraries
with no linking destination, or they are captured and never seen.

Destinations that option (a) would leave with no itinerary:

`caribbean/the-windward-islands`, `caribbean/the-windward-islands/st-vincent-the-grenadines`, `caribbean/the-windward-islands/st-vincent-the-grenadines/dominica`, `caribbean/virgin-islands`, `mediterranean/france/corsica`, `mediterranean/france/corsica/calvi`, `mediterranean/greece/crete`, `mediterranean/greece/the-saronic-islands`, `mediterranean/italy/italian-riviera`, `mediterranean/italy/italian-riviera/cinque-terre`, `mediterranean/italy/italian-riviera/genoa`, `mediterranean/italy/italian-riviera/portofino`, `mediterranean/italy/sardinia`, `mediterranean/italy/sardinia/olbia`, `mediterranean/malta`, `mediterranean/montenegro`, `mediterranean/spain/valencia`

Destinations that option (b) would leave with no itinerary:

`mediterranean/italy/italian-riviera/cinque-terre`, `mediterranean/italy/italian-riviera/genoa`, `mediterranean/italy/italian-riviera/portofino`

## 6. Dominica and Martinique in the destination tree

**The import introduced the nesting; the website does not have it.** Both pages sit directly under The Windward
Islands, and the deeper paths the snapshot uses are 301 redirects:

| Path in the snapshot | Live response |
|---|---|
| `/destinations/caribbean/the-windward-islands/st-vincent-the-grenadines/dominica/` | **301** → `/destinations/caribbean/the-windward-islands/dominica/` |
| `/destinations/caribbean/the-windward-islands/st-vincent-the-grenadines/martinique/` | **301** → `/destinations/caribbean/the-windward-islands/martinique/` |

The destinations import derives a destination id from the URL it followed, not from the page's canonical URL,
so a link that redirects is recorded at the pre-redirect path. That is the same defect that gave the Kimberley
itinerary its `australasia` id. It is flagged, not fixed: correcting it moves two destination ids, which
changes the level of `dominica` and `martinique` from 4 to 3 and therefore their sails-there radius from 60 km
to 150 km. That is a mapping change, and out of scope for this pass.

## 7. What changed on disk

| File | Change |
|---|---|
| `data/destinations.json` | 38 itinerary records, verbatim, against 32. `itineraryLinks` re-read on all 125 destinations: Greece gains one, the two Kimberley links move to the canonical URL. |
| `content/itinerary-stops.json` | The new itineraries' day headings located. Existing entries, including the 31 hand corrections, untouched. |
| `data/itineraries.json`, `docs/itinerary-coverage.md` | Rebuilt by `npm run build:itineraries`; the script itself is unchanged. |
| `src/server/atlas/website.mjs` | The three parser fixes described at the top. |
| `scripts/build-itineraries.mjs`, the radius constants, `MAX_PER_DESTINATION` | Unchanged. |