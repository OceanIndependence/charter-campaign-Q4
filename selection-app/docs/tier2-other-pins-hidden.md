# Tier 2 globe — chosen destinations only

**Status: temporary. Requested 16 September 2026. Reverting is one line.**

The Personalised Atlas (Tier 2, `/destinations/<slug>`) was built to show the whole
Atlas around the shortlist: the consultant's chosen destinations pinned bright,
every other Atlas destination dimmed but clickable, opening a "beyond the
shortlist" panel. The globe now carries the chosen destinations and nothing
else.

## How it is switched off

One flag, `src/lib/atlas/tier2-other-pins.ts`:

```ts
export const SHOW_OTHER_PINS: boolean = false;
```

`src/components/personalised/PersonalisedAtlasPage.tsx` reads it in two
places, and in both the original expression is kept as the `true` branch:

- the `pins` memo — the dimmed pins are appended to the chosen ones only when
  the flag is on;
- the `otherById` map — empty while the flag is off, so no pin resolves to an
  "other" destination, `selectOther()` never fires and the BEYOND THE
  SHORTLIST panel never renders.

Nothing else moved. In particular the data pipeline is untouched:

- `otherPinsFor()` / `atlasResolutionFor()` in `src/server/atlas/content.ts`
  still resolve the resting Atlas pins;
- `tier2DraftToConfig()` in `src/lib/atlas-map.ts` still writes them to
  `AtlasPageConfig.otherPins`;
- every page published while the flag is off still freezes the full pin set
  into its stored config, exactly as before.

So the pins are only hidden at render time, on drafts, previews, the demo page
and every already-published page alike.

## To restore the original globe

Set `SHOW_OTHER_PINS` to `true` in `src/lib/atlas/tier2-other-pins.ts` and
deploy. No other file changes, and no page needs republishing — published
configs already carry their pins.

## Not changed

The static design demo at `/personalised-atlas/` (the Tier 2 design export at
the repo root) still shows its own surrounding pins. It is a frozen reference
bundle, not the production page.
