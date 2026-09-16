# Builder field report (Phase 0)

Written 16 September 2026 on branch `claude/gallant-cray-bmjpyd`. Nothing has
been built: this report and the temporary read-only diagnostic route it
describes are the only changes.

## Summary

- The brochure carries `builder` in two places: `specifications.builder`
  (fixed block, every data_source) and `<detail block>.builder`, where the
  detail block is `auto`, `manual` or `manual_text` according to
  `general.data_source`. The shared normaliser already reads both, in that
  order.
- The live questions were answered by running the diagnostic on Vercel on
  16 September 2026 (section 8): 45 yachts in use, not 32; all 45 return a
  non-empty builder; `specifications.builder` and the detail block agree on
  every yacht; 40 auto and five manual, no text; mixed casing for one yard
  (GOLDEN YACHTS and Golden Yachts), one trailing space, no HTML; no build
  country field, but flag, hull configuration, hull construction and naval
  architect sit alongside.
- A temporary portal-authed route, `GET /api/admin/builder-field-report`,
  answers all of them on Vercel, where both variables exist, and returns
  Markdown as text/plain for section 8 below. It is tested against a mock
  brochure server covering auto, manual and text, and typechecks.
- The nightly cache does not store raw Yachtfolio responses, only normalised
  output, so the route has to make live calls: one brochure call per in-use
  yacht, sequential, 400 ms apart, 32 calls in all.
- One observation about the existing read path, reported rather than fixed:
  a blank `specifications.builder` masks the detail block's value, because
  the fallback uses `??`. Per your decision the data_source rule stays as it
  is; the route counts how often that happens and whether the blocks ever
  disagree. Live result: it never happens on any yacht in use.

## 1. Exact paths where builder appears

Brochure (`api_brochure.cgi?id_yacht=<id>`):

| Path | Read today | Notes |
|---|---|---|
| `specifications.builder` | Yes, first | `specifications` is a fixed top-level block, present whatever `general.data_source` says. |
| `auto.builder` | Yes, fallback when `data_source` is `auto` | The detail block. Also carries `cabin_config`, `toys`, `engines`, `length`, `built`, `refit`. |
| `manual.builder` | Yes, fallback when `data_source` is `manual` | Same shape as `auto`, consultant-maintained in Yachtfolio. |
| `manual_text.builder` | Yes, fallback when `data_source` is `text` | The block whose `text_specs` replaces the description on text yachts. |
| `general.builder` | No | Not documented and not read anywhere. The diagnostic checks for it so the report can say whether it exists. |

The reading code is `specBlocks()`, `factsFromBrochure()` and
`extractYachtFacts()` in `selection-app/src/server/yachtfolio/normalise.mjs`
(lines 87 to 93, 164 to 170 and 203 to 204). `extractYachtFacts()` adds a
third fallback to `basic.builder` from the per-id basic record.

Outside the brochure:

- The per-id basic record (`api_basic.cgi?type=yachts&id_yacht=<id>`) has
  never returned a row for a charter-list yacht; confirmed on the preview on
  14 September 2026 and recorded in `docs/sirv-image-pipeline-build.md`. Its
  `builder` fallback is therefore dead in practice.
- The agency basic list (`api_basic.cgi?type=yachts`, no id) carries
  `builder` and `other_builder`. It also carries personal and internal data,
  so the app reads it only under `?debug=1` for counts and never persists it.
  It is not a source for this feature.
- The public fleet list (`type=list`) is documented as `{ id, name,
  registry_port }`. `fetchFleetSnapshot()` reads `builder` from its rows
  opportunistically, but the nightly notes will show whether any row has
  ever carried one.
- The Tier 1 Atlas parses a builder out of the website's yacht card text
  ("58m (191') - Trinity Yachts - 2009 - 12 Guests"). That is the website,
  not Yachtfolio, and is unrelated to this change.

## 2. Consistency across `general.data_source`

What can be said from the code and documentation:

- `specifications` does not move with `data_source`; the detail block does.
  The normaliser's precedence is therefore the same for all three values:
  `specifications.builder`, then the moving block's `builder`.
- `checkBrochureShape()` warns when the block named by `data_source` is
  absent, so a brochure with `data_source: "text"` and no `manual_text` block
  would already show up in the fetch report.
- Whether `specifications.builder` is populated on manual and text yachts, and
  whether the two blocks ever disagree, is a live question. The diagnostic
  reports, per data_source value, how many yachts have a builder in the
  specifications block only, the detail block only, both, and how many
  disagree.

Observation on the current fallback, for the record. `spec.builder ??
detail.builder` treats an empty string as a value, so a yacht whose
`specifications.builder` is `""` while `manual.builder` is `"Benetti"`
returns nothing today. The mock run reproduces it (data_source manual:
current rule 0 of 1). The rule is not being changed: it governs staterooms
and engines as well, and the live "Masked" and "Disagree" columns in
section 8 will show whether this is a real case and whether it is a
Yachtfolio data quality point rather than something for the code to work
around.

## 3. How many of the 32 in-use yachts return a non-empty builder

Not available from this session. The in-use set lives in the private data
store as `selections/in-use.json`; the environment has neither the store
token nor the passkey. The route reads the index on Vercel, fetches each
brochure once (one call per yacht, sequential, 400 ms apart, 32 calls in
all) and prints the count with the current rule, plus how many yachts have a
value in some block at all.

Cache check. Neither `yachtfolio/fleet.json` nor the per-yacht records
(`yachts/<id>.json`) hold a raw brochure: the fleet file carries list rows
and the three picker facts, the records carry the normalised detail
document. The only raw copy is a five-minute in-memory memo per serverless
instance (`brochureFor()` in `gallery.mjs`), which the route reuses, so a
refresh within five minutes on the same instance costs no calls. There is no
way to derive the report without live calls.

For reference only, the six demo yachts served without a passkey carry
`""`, `"Amer"`, `"Bilgin Yachts"`, `"Ferretti"`, `"Riva"` and `""`. These are
hand-written demo values, not Yachtfolio output.

## 4. Raw values for five real yachts

Not available from this session. The route prints every yacht read, not
five, with the value of all three blocks quoted as JSON strings so trailing
whitespace, all-caps source data, "Shipyard" suffixes and HTML are visible.
The passkey is redacted from the whole response before it is sent.

What the code does to the value today: `String(v).trim()` on the server, no
case change, no HTML stripping. So whatever casing Yachtfolio uses reaches
the form's picker as is.

## 5. Build country or hull material alongside it

Nothing in the code, the documentation notes or the docs folder reads or
mentions a build country, hull material, flag or designer field from
Yachtfolio. The route lists every brochure key whose name contains country,
hull, material, flag, naval, designer or architect, with a sample value, so
the answer will be in section 8.

## 6. What already exists downstream (relevant to Phases 1 to 4)

Present:

- `GET /api/fleet/:yfId` returns `builder` as a string, `""` when missing,
  and lists `"builder"` in `missing` when it is. The `FleetDetail` type has
  `builder: string`.
- The fleet list rows (`FleetEntry.builder`) carry it for the picker, which
  shows "NAME · Builder · 45 m — YF-1234".
- Per-yacht records keep it in `facts.builder`.

Absent, and to be added in Phase 1:

- `DraftYacht` has no `builder`, so drafts do not save it and the auto-fill
  patch (`applyDetail`, `AUTO_FIELDS`) does not carry it.
- `Yacht` in `src/lib/types.ts`, the shared published type both client pages
  read, has no `builder`; `mapDraftYacht()` does not map it. Existing
  published pages will keep frozen specs without the field, which is why it
  must be optional throughout.
- `SpecPanel`, the Tier 2 card meta line (`yachtMeta()`), and `Compare` do
  not read it. The Tier 2 build report records the meta line omitting it as a
  design decision; this request reverses that decision.

Styling facts for Phases 3 and 4: `SpecPanel .specLabel` uses `--fg-45`
(light theme `#555759`), and `.cardMeta` on the Tier 2 card uses the same
token, so no new token is needed.

## 7. Overflow proposal for the Tier 2 card stat line (Phase 4, decision needed)

Today the meta line is one `div` with no wrapping rules, 10.5 px type with
0.14 em tracking, so it wraps freely at any space. At the 420 px breakpoint
the card is 86 vw with 20 px padding each side: about 295 px of text on a
390 px phone, about 235 px on a 320 px one. That is roughly 35 characters per
line at 390 px and 28 at 320 px.

"38M · 10 GUESTS · 5 STATEROOMS" is 30 characters and fits one line today.
Adding "SUNSEEKER" makes 42 and two lines. "ABEKING & RASMUSSEN" makes 52,
"CANTIERE DELLE MARCHE" 54, and because the natural break points fall at the
separators, a 320 px phone can reach three lines.

Two options:

1. Controlled two-line wrap (recommended). Render each segment as a
   `white-space: nowrap` span so a segment never breaks inside itself, allow
   the line to wrap only between segments, and clamp the block to two lines
   with `-webkit-line-clamp: 2`. Nothing is cut mid-word at any width down to
   320 px; a very long builder simply takes the second line with the
   separators still in the right places. Card height grows by one line on
   phones for long names, which the rail already tolerates for two-line names.
2. Single line with truncation. Make the builder segment a flex item with
   `min-width: 0; overflow: hidden; text-overflow: ellipsis` and keep the
   line to one row. The card height never changes, but "ABEKING & RAS…" reads
   as broken on a page whose typography is otherwise exact, and the ellipsis
   appears at 390 px for most two-word builders.

Decision: option 1, the controlled two-line wrap. Confirmed 16 September
2026.

## 8. Live results

Open the route on the preview for this branch, or on production once the
branch is merged, while signed in to the portal:

```
/api/admin/builder-field-report
/api/admin/builder-field-report?ids=12683,12901
```

The first form reads `selections/in-use.json` on the deployment and inspects
every yacht in it; the second inspects only the ids given (a preview whose
data store differs from production may hold a different in-use set, so the
production URL is the one that answers the 32-yacht question). The
response is text/plain Markdown with four tables: paths seen,
per-data_source counts, raw values for every yacht, adjacent fields. Paste
it below.

Safety: portal session required; one run per minute per address; at most 60
ids per run; one brochure call per yacht, sequential, 400 ms apart; a spent
rate-limit back-off ends the run and marks the rest "not attempted"; no
writes to Blob, no image calls, only a count in the logs; the passkey is
read from the environment and redacted from the response.

Temporary files, to delete once the output is pasted here:

- `selection-app/src/app/api/admin/builder-field-report/route.ts` (delete the folder)
- `selection-app/src/server/yachtfolio/builder-field-report.mjs`

Run on 16 September 2026 at 08:38 UTC against the deployment's in-use index. Output pasted verbatim.

Generated 2026-09-16T08:38:40.134Z — 45 yacht id(s) from selections/in-use.json; 45 brochure(s) read, 0 failed; Yachtfolio calls this request: 45.

#### Where `builder` appears (key paths across every brochure read)

| Path | Present in | Non-empty in |
|---|---|---|
| `auto.builder` | 40 | 40 |
| `manual.builder` | 5 | 5 |
| `specifications.builder` | 45 | 45 |

#### By `general.data_source`

Current = what normalise.mjs returns today (`specifications.builder`, else the detail block). Masked = `specifications.builder` present but blank while the detail block has a value. Disagree = both non-empty and different.

| data_source | Yachts | Non-empty (current rule) | specifications only | detail block only | Both | Neither | Masked | Disagree |
|---|---|---|---|---|---|---|---|---|
| auto | 40 | 40 | 0 | 0 | 40 | 0 | 0 | 0 |
| manual | 5 | 5 | 0 | 0 | 5 | 0 | 0 | 0 |

#### Non-empty builder: 45 of 45 yacht(s) read with the current rule; 45 of 45 have a value in some block

#### Raw values (every yacht, unmodified — quotes show whitespace)

| YF id | data_source | specifications.builder | detail block builder | general.builder |
|---|---|---|---|---|
| 205 | auto | "Lurssen" | "Lurssen" | ∅ (absent) |
| 1268 | auto | "Feadship" | "Feadship" | ∅ (absent) |
| 5893 | auto | "Sanlorenzo" | "Sanlorenzo" | ∅ (absent) |
| 6134 | auto | "Mangusta (Overmarine)" | "Mangusta (Overmarine)" | ∅ (absent) |
| 7198 | auto | "Heesen" | "Heesen" | ∅ (absent) |
| 7313 | auto | "Heesen" | "Heesen" | ∅ (absent) |
| 9155 | auto | "GOLDEN YACHTS" | "GOLDEN YACHTS" | ∅ (absent) |
| 9235 | auto | "Admiral" | "Admiral" | ∅ (absent) |
| 9750 | auto | "Maiora" | "Maiora" | ∅ (absent) |
| 10141 | auto | "Alpha" | "Alpha" | ∅ (absent) |
| 10578 | manual | "Sunseeker" | "Sunseeker" | ∅ (absent) |
| 10737 | manual | "Sunreef Yachts" | "Sunreef Yachts" | ∅ (absent) |
| 10770 | auto | "Urkmezler Yachts" | "Urkmezler Yachts" | ∅ (absent) |
| 10931 | manual | "Codecasa" | "Codecasa" | ∅ (absent) |
| 11091 | manual | "Sunseeker" | "Sunseeker" | ∅ (absent) |
| 11411 | auto | "Tansu" | "Tansu" | ∅ (absent) |
| 11621 | auto | "Ferretti" | "Ferretti" | ∅ (absent) |
| 11672 | auto | "Radez d.d." | "Radez d.d." | ∅ (absent) |
| 11705 | auto | "Golden Yachts" | "Golden Yachts" | ∅ (absent) |
| 11865 | auto | "Ortona Navi" | "Ortona Navi" | ∅ (absent) |
| 12041 | auto | "Benetti" | "Benetti" | ∅ (absent) |
| 12220 | auto | "Golden Yachts" | "Golden Yachts" | ∅ (absent) |
| 12374 | auto | "Broward Marine" | "Broward Marine" | ∅ (absent) |
| 12455 | auto | "Rossinavi" | "Rossinavi" | ∅ (absent) |
| 12683 | auto | "Bilgin Yachts" | "Bilgin Yachts" | ∅ (absent) |
| 13371 | auto | "Alloy Yachts" | "Alloy Yachts" | ∅ (absent) |
| 13415 | auto | "Lagoon" | "Lagoon" | ∅ (absent) |
| 13713 | auto | "GOLDEN YACHTS" | "GOLDEN YACHTS" | ∅ (absent) |
| 13726 | auto | "Sanlorenzo" | "Sanlorenzo" | ∅ (absent) |
| 13887 | auto | "Heesen" | "Heesen" | ∅ (absent) |
| 13910 | auto | "Maiora" | "Maiora" | ∅ (absent) |
| 14097 | auto | "Heesen" | "Heesen" | ∅ (absent) |
| 14418 | auto | "Lurssen" | "Lurssen" | ∅ (absent) |
| 14560 | manual | "Leopard (Arno)" | "Leopard (Arno)" | ∅ (absent) |
| 14703 | auto | "Mulder" | "Mulder" | ∅ (absent) |
| 15286 | auto | "Icon" | "Icon" | ∅ (absent) |
| 15352 | auto | "Sanlorenzo" | "Sanlorenzo" | ∅ (absent) |
| 15483 | auto | "Sunseeker" | "Sunseeker" | ∅ (absent) |
| 15489 | auto | "Tréhard Ship Builders " | "Tréhard Ship Builders " | ∅ (absent) |
| 15856 | auto | "Sanlorenzo" | "Sanlorenzo" | ∅ (absent) |
| 15880 | auto | "Bodrum Shipyard" | "Bodrum Shipyard" | ∅ (absent) |
| 16408 | auto | "Sanlorenzo" | "Sanlorenzo" | ∅ (absent) |
| 16743 | auto | "Benetti" | "Benetti" | ∅ (absent) |
| 16771 | auto | "Amels" | "Amels" | ∅ (absent) |
| 16905 | auto | "Sunreef Yachts" | "Sunreef Yachts" | ∅ (absent) |

#### Fields sitting alongside it (country / hull / material / flag / designer keys)

| Path | Present in | Non-empty in | Sample |
|---|---|---|---|
| `auto.flag` | 40 | 40 | "Isle of Man" |
| `auto.hull_configuration` | 40 | 40 | "Displacement" |
| `auto.hull_construction` | 40 | 40 | "Steel" |
| `auto.naval_architect` | 40 | 32 | "Espen Oino" |
| `manual.flag` | 5 | 5 | "French" |
| `manual.hull_configuration` | 5 | 5 | "Planing hull" |
| `manual.hull_construction` | 5 | 5 | "GRP" |
| `manual.naval_architect` | 5 | 4 | "Sunreef Yachts" |
| `specifications.flag` | 45 | 45 | "Isle of Man" |
| `specifications.hull_configuration` | 45 | 45 | "Displacement" |
| `specifications.hull_construction` | 45 | 45 | "Steel" |
| `specifications.naval_architect` | 45 | 35 | "Espen Oino" |

### Findings from the live results

- **Count.** The in-use index holds 45 yachts, not 32. Every one of the 45
  returns a non-empty builder. If 32 is the figure you expected, the index
  has grown since it was last counted, or the 32 refers to a different set
  (published pages only, say); the rebuild route can be run to check.
- **Consistency.** `specifications.builder` is present and non-empty on all
  45, and identical to the detail block's value on all 45: zero masked, zero
  disagreements. For builder, the data_source rule is immaterial; the
  specifications block alone would give the same answer on every yacht in
  use. Nothing to raise with Yachtfolio on consistency.
- **Variants covered.** 40 auto, five manual, no text. The `manual_text`
  branch is unexercised by any yacht currently in use, so it stays a code
  path covered by the shared rule rather than by evidence.
- **Formatting, from the raw values.**
  - Casing is mixed within Yachtfolio for the same builder: "GOLDEN YACHTS"
    on two yachts (9155, 13713) and "Golden Yachts" on two others (11705,
    12220). Every other value is in ordinary title case as the builder
    writes it.
  - One trailing space: "Tréhard Ship Builders " (15489). The trim in Phase 1
    removes it.
  - No HTML in any value.
  - Suffixes and qualifiers appear as the yards style themselves: "Bodrum
    Shipyard", "Tréhard Ship Builders", "Mangusta (Overmarine)", "Leopard
    (Arno)", "Radez d.d.", "Sunreef Yachts", "Bilgin Yachts". None of these
    should be stripped; they are the names.
  - One diacritic present ("Tréhard") and one missing ("Lurssen" rather than
    Lürssen, on 205 and 14418). A Yachtfolio data point, not a code one.
  - Longest values are 21 characters: "Mangusta (Overmarine)" and "Tréhard
    Ship Builders". With the two-line wrap agreed for the card line that is
    comfortably handled; the parenthetical segments stay unbroken.
- **Casing decision, for you.** The Tier 2 card line is rendered in capitals
  anyway, so GOLDEN YACHTS and Golden Yachts read the same there. The form
  field and the Tier 3 spec panel show the value as stored, so those two
  yachts would read differently from the other two. Options: preserve as
  Yachtfolio returns it (the instruction so far), or have the normaliser
  title-case only values that arrive entirely in capitals, leaving mixed-case
  values untouched. I will preserve unless you choose the second.
- **Adjacent fields.** There is no build country field. Alongside builder in
  every block sit `flag` (45 of 45, but inconsistently styled: "Isle of Man"
  against "French"), `hull_configuration` (45 of 45, "Displacement",
  "Planing hull"), `hull_construction` (45 of 45, "Steel", "GRP") and
  `naval_architect` (35 of 45). None is in scope for this change; they are
  noted for later.

## 9. Verification notes for Phase 1 onwards

- The Vercel project builds branches from GitHub, so pushing this branch
  produces the preview. If the preview lacks the passkey the route answers
  503 with a plain message and makes no calls; run it on production instead.
- The blanked-builder check will use the demo yachts SERENITY and AURELIA,
  which already carry an empty builder. Confirmed 16 September 2026.

## 10. Build notes (Phases 1 to 4, 16 September 2026)

- **Data.** `normaliseBuilder()` in the shared normaliser: HTML stripped,
  whitespace trimmed and collapsed, blank → undefined. Mixed-case values are
  preserved; a value entirely in capitals is title-cased word by word, with
  words of three letters or fewer kept in capitals so yard acronyms survive
  (GOLDEN YACHTS → Golden Yachts, CRN → CRN, AB YACHTS → AB Yachts). It is
  used by `extractYachtFacts()`, `factsFromBrochure()` and the fleet list
  facts, so the picker and the form agree. The data_source rule is
  unchanged. `builder?: string` is added to the shared `Yacht` type and to
  `DraftYacht`; `mapDraftYacht()` maps it. Pages published earlier have no
  field and every reader treats it as optional.
- **Forms.** BUILDER after YEAR / REFIT on both yacht cards, on the existing
  auto-fill list and dirty tracking, with the same "Auto-filled on selection"
  placeholder as the neighbouring fields.
- **Spec panel.** BUILDER row between YEAR / REFIT and GUESTS, hidden when
  absent, on the existing `.specLabel` token. The Tier 2 drawer is the same
  component and shows the row. The Compare overlay, used at both tiers, has
  the same row in the same position; as with its other rows, a yacht without
  a value gets an empty cell and the row is hidden when no yacht can fill it.
- **Tier 2 cards.** Builder in capitals after the length. Each segment,
  with its trailing middot, is a nowrap span; the line wraps only between
  segments and is clamped to two lines. Verified locally at 1280, 390 and
  320 px: "50M · BILGIN YACHTS · 12 GUESTS · 6 STATEROOMS" is two lines at
  320 px with nothing clipped.
- **Temporary diagnostic removed.** The admin route and its module are
  deleted in this change.
