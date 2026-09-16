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
- The live questions (consistency across data_source, the count over the
  32 in-use yachts, five raw values, adjacent fields) could not be answered
  from this session: there is no `YACHTFOLIO_PASSKEY`, no Blob token for the
  in-use index, and every route on the deployed app answers 401 without a
  portal session. Yachtfolio itself is reachable from here; it answered
  "Parameter passkey has not been provided or has incorrect format".
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
  disagree, so the question can go to Yachtfolio if it is a data issue.

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

_Results pending: paste the route's output here._

## 9. Verification notes for Phase 1 onwards

- The Vercel project builds branches from GitHub, so pushing this branch
  produces the preview. If the preview lacks the passkey the route answers
  503 with a plain message and makes no calls; run it on production instead.
- The blanked-builder check will use the demo yachts SERENITY and AURELIA,
  which already carry an empty builder. Confirmed 16 September 2026.
