# Builder field report (Phase 0)

Written 16 September 2026 on branch `claude/gallant-cray-bmjpyd`. Nothing has
been built: this report and the read-only diagnostic script it describes are
the only changes.

## Summary

- The brochure carries `builder` in two places: `specifications.builder`
  (fixed block, every data_source) and `<detail block>.builder`, where the
  detail block is `auto`, `manual` or `manual_text` according to
  `general.data_source`. The shared normaliser already reads both, in that
  order.
- The live questions (consistency across data_source, the count over the
  32 in-use yachts, five raw values, adjacent fields) could not be answered
  from this session: there is no `YACHTFOLIO_PASSKEY`, no Blob token for the
  in-use index, and every route on the deployed app answers 401 without a
  portal session. Yachtfolio itself is reachable from here; it answered
  "Parameter passkey has not been provided or has incorrect format".
- A one-command diagnostic, `selection-app/scripts/builder-field-report.mjs`,
  answers all of them and prints Markdown for section 8 below. It is tested
  against a mock brochure server covering auto, manual and text.
- One defect found in the existing read path: a blank `specifications.builder`
  masks the detail block's value, because the fallback uses `??`. Whether it
  bites depends on live data; the diagnostic counts it.

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

Defect in the current fallback. `spec.builder ?? detail.builder` treats an
empty string as a value, so a yacht whose `specifications.builder` is `""`
while `manual.builder` is `"Benetti"` returns nothing today. The mock run
reproduces it (data_source manual: current rule 0 of 1, first-non-empty rule
1 of 1). Phase 1 should take the first non-empty block instead, in the shared
module, on the same path. I will do that unless you say otherwise.

## 3. How many of the 32 in-use yachts return a non-empty builder

Not available from this session. The in-use set lives in the private data
store as `selections/in-use.json`; the environment has neither the store
token nor the passkey. The diagnostic reads the index when the token is
present, or takes ids on the command line, fetches each brochure once (one
call per yacht, 400 ms apart, 32 calls in all) and prints the count with the
current rule and with the first-non-empty rule.

For reference only, the six demo yachts served without a passkey carry
`""`, `"Amer"`, `"Bilgin Yachts"`, `"Ferretti"`, `"Riva"` and `""`. These are
hand-written demo values, not Yachtfolio output.

## 4. Raw values for five real yachts

Not available from this session. The diagnostic prints every yacht read, not
five, with the value of all three blocks quoted as JSON strings so trailing
whitespace, all-caps source data, "Shipyard" suffixes and HTML are visible.
The passkey is redacted from every line before it is printed.

What the code does to the value today: `String(v).trim()` on the server, no
case change, no HTML stripping. So whatever casing Yachtfolio uses reaches
the form's picker as is.

## 5. Build country or hull material alongside it

Nothing in the code, the documentation notes or the docs folder reads or
mentions a build country, hull material, flag or designer field from
Yachtfolio. The diagnostic lists every brochure key whose name contains
country, hull, material, flag, naval, designer or architect, with a sample
value, so the answer will be in section 8.

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

I will build option 1 unless you choose option 2.

## 8. Live results

Run the diagnostic where the passkey is available (a local checkout with
`.env.local`, or a machine with the Vercel environment pulled). With the
data store token it reads the in-use index itself; without it, pass the ids.

```
cd selection-app
npm install
YACHTFOLIO_PASSKEY=… PORTAL_DATA_READ_WRITE_TOKEN=… node scripts/builder-field-report.mjs
# or
YACHTFOLIO_PASSKEY=… node scripts/builder-field-report.mjs 12683 12901 …
```

It prints a Markdown fragment with four tables (paths seen, per-data_source
counts, raw values for every yacht, adjacent fields) that can be appended
here. It makes no writes to Blob and no image calls.

_Results pending: the section is filled in once the command has been run
with the passkey._

## 9. Verification blockers to note before Phase 1

- No Vercel token in this session, so I cannot create a preview deployment
  directly. If the Vercel project is connected to the GitHub repository,
  pushing the branch produces the preview automatically; otherwise the
  deploy will need to be triggered on your side.
- The preview will run without a passkey unless the environment variables are
  set on preview deployments, in which case the demo fleet renders. That is
  enough for the Harrington page and for the blanked-builder check, since two
  demo yachts (SERENITY, AURELIA) already carry an empty builder.
