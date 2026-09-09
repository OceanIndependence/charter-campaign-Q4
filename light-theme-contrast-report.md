# Light theme contrast report

Ocean Independence — client-facing Yacht Selection page (`selection-app`).
Branch `claude/light-theme-contrast-tokens`. Prepared 09 September 2026.

The light theme's colour layer has been rebuilt from the five permitted brand
colours and now lives entirely in one file, `selection-app/src/app/theme-tokens.css`.
No component stylesheet holds a hex value, an `rgba()` or a per-theme colour
override. The dark theme is unchanged.

Every "after" figure below was measured in a browser on a published light-theme
page, not calculated from the stylesheet. Each element's colour and its real
composited background were read with `getComputedStyle`, then the WCAG 2.1
contrast ratio was computed from those two values. The "before" figures are
computed from the stylesheet as it stood, including alpha compositing over the
old off-white ground.

## What the review found, and what it measures now

| Problem cited | Before | After |
|---|---|---|
| Mint used for body copy, micro-labels and figures | 1.41:1 | Mint no longer appears as text on a light ground |
| Brand grey used for micro-labels | 2.85:1 | 7.26:1 (Graphite) |
| Off-white content panels | #FAFAF8 | #FFFFFF |

Monochrome on White measures 16.86:1. Graphite on White measures 7.26:1.
Monochrome on Mint measures 12.00:1. Those three pairings carry the whole page.

## The permitted colours and their roles

| Token | Hex | Name | Role in the light theme |
|---|---|---|---|
| `--oi-mono` | #1D1D1D | Monochrome | Headings, body copy, all cost-table figures, TOTAL, link text, active pagination indicator |
| `--oi-graphite` | #555759 | Graphite | Secondary body copy, all small-caps micro-labels, spec icons, accordion markers, eyebrow, counters |
| `--oi-grey` | #99999A | Grey | Rules, table dividers, card borders, inactive fills. Never text, never icons, never interactive controls |
| `--oi-mint` | #A7E6D7 | Mint | Decoration only: accent rules, the vertical rule beside intro sentences, link underlines, the fill behind the 01–04 highlight markers |
| `--oi-white` | #FFFFFF | White | Every content panel |

There is exactly one mint. No tint, shade, opacity variant or darkened
derivative of #A7E6D7 renders anywhere in the light theme. Every place that
previously used a mint alpha (the floor ring glow, the inactive card dash, the
compare-toggle fill, the button hover wash, the TOTAL rule, the note rule) now
uses either flat #A7E6D7 or a neutral from the list above.

## Element-by-element

Ratios are against each element's actual measured background. "Rule" rows
carry no contrast requirement. Every text, figure and icon row that passes also
clears the preferred 7:1, because the light theme only ever puts Monochrome on
White (16.86:1), Graphite on White (7.26:1) or Monochrome on Mint (12.00:1).

### Cover

| Element | Old colour | Old ratio | New token | New colour | Ground | New ratio | Target | Verdict |
|---|---|---|---|---|---|---|---|---|
| Header label (SUMMER 2027) | #757575 | 4.41:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Cover eyebrow (TWO YACHTS, HELD…) | #757575 | 4.41:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Cover headline | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Cover subline | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |

### Carousel and cards

| Element | Old colour | Old ratio | New token | New colour | Ground | New ratio | Target | Verdict |
|---|---|---|---|---|---|---|---|---|
| Carousel counter (01 OF 2 — NAME) | #8C8C8B | 3.22:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Card yacht name | #1D1D1D | 16.86:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Card stat value (12, 6, 47M) | #1D1D1D | 16.86:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Card micro-label (GUESTS/STATEROOMS/LENGTH) | #999999 | 2.85:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Card rate line | #1D1D1D | 16.86:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Card cruising-area label | #8E8E8E | 3.28:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| SOUND OFF label | #979795 | 2.8:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Active card dash | #A7E6D7 | 1.41:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 3:1 | pass |
| Inactive card dash | #E5F8F3 | 1.1:1 | `--oi-grey` | #99999A | #FFFFFF | 2.85:1 | — | n/a — rule |
| Active pagination bar | #A7E6D7 | 1.34:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 3:1 | pass |
| Inactive pagination bar | #C3C3C1 | 1.69:1 | `--oi-grey` | #99999A | #FFFFFF | 2.85:1 | — | n/a — rule |
| Card border | #DBDBD9 | 1.33:1 | `--oi-grey` | #99999A | #FFFFFF | 2.85:1 | — | n/a — rule |
| Card spec icons | #CAF0E7 | 1.23:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |
| Carousel chevrons | #B8EADE | 1.27:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |
| Compare toggle glyph | #565656 | 7.34:1 | `--oi-mono` | #1D1D1D | #A7E6D7 | 12:1 | 3:1 | pass |

### Specification panel and cost table

| Element | Old colour | Old ratio | New token | New colour | Ground | New ratio | Target | Verdict |
|---|---|---|---|---|---|---|---|---|
| Spec panel counter (01 OF 2) | #A2A2A0 | 2.45:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Spec panel yacht name | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Broker note | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Vertical rule beside the note | #D1F0E8 | 1.16:1 | `--oi-mint` | #A7E6D7 | #FFFFFF | 1.41:1 | — | n/a — rule |
| Spec micro-labels (LENGTH, GUESTS, CREW…) | #979795 | 2.8:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Spec values (data) | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Spec table dividers | #E8E8E6 | 1.17:1 | `--oi-grey` at 50% | #CCCCCD | #FFFFFF | 1.6:1 | — | n/a — rule |
| WEEKLY RATE amount | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| VAT and APA amounts | #5F5F5F | 6.11:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| TOTAL label | #A7E6D7 | 1.34:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 7:1 | pass |
| TOTAL amount | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| TOTAL rule | #D9F2EB | 1.13:1 | `--oi-mint` | #A7E6D7 | #FFFFFF | 1.41:1 | — | n/a — rule |
| HIGHLIGHTS heading | #A7E6D7 | 1.34:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Highlight marker glyph (01–04) | #A7E6D7 | 1.34:1 | `--oi-mono` | #1D1D1D | #A7E6D7 | 12:1 | 4.5:1 | pass |
| Highlight text | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| VIEW BROCHURE link | #757575 | 4.41:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Spec nav button border | #C3C3C1 | 1.69:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |
| Spec nav chevron glyph | #545454 | 7.25:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |

### Costs Involved and Your Itinerary

| Element | Old colour | Old ratio | New token | New colour | Ground | New ratio | Target | Verdict |
|---|---|---|---|---|---|---|---|---|
| Accordion titles (COSTS INVOLVED) | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Accordion plus/minus marker | #757575 | 4.41:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |
| Costs Involved headings (APA, VAT…) | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Costs Involved paragraphs | #5B5B5A | 6.51:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Itinerary intro sentence | #494949 | 8.61:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| VIEW YOUR SUGGESTED ITINERARY link | #757575 | 4.41:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |

### Consultant footer

| Element | Old colour | Old ratio | New token | New colour | Ground | New ratio | Target | Verdict |
|---|---|---|---|---|---|---|---|---|
| Consultant name | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Role line (Charter Consultant…) | #8C8C8B | 3.22:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 4.5:1 | pass |
| Phone number | #5F5F5F | 6.11:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Email address | #5F5F5F | 6.11:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Phone and mail icons | #C0ECE1 | 1.23:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |
| WhatsApp button label | #1D1D1D | 16.13:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| WhatsApp button border | #8C8C8B | 3.22:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |
| EXPLORE ALL 2027 DESTINATIONS | #979795 | 2.8:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| …its arrow glyph | #979795 | 2.8:1 | `--oi-mint` | #A7E6D7 | #FFFFFF | 1.41:1 | 3:1 | **FAILS** |

### Page furniture

| Element | Old colour | Old ratio | New token | New colour | Ground | New ratio | Target | Verdict |
|---|---|---|---|---|---|---|---|---|
| Disclaimer line | #A2A2A0 | 2.45:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Footer tagline | #ADADAB | 2.15:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |

### Compare bar

| Element | Old colour | Old ratio | New token | New colour | Ground | New ratio | Target | Verdict |
|---|---|---|---|---|---|---|---|---|
| Compare bar yacht names | #777777 | 4.48:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 7:1 | pass |
| Compare bar COMPARE action | #A7E6D7 | 1.41:1 | `--oi-mono` | #1D1D1D | #FFFFFF | 16.86:1 | 4.5:1 | pass |
| Compare bar clear glyph | #8E8E8E | 3.28:1 | `--oi-graphite` | #555759 | #FFFFFF | 7.26:1 | 3:1 | pass |

## The nine specific fixes

**1. Content panel backgrounds are White.** `--page-base`, `--page-bg`,
`--surface` and `--overlay-bg` are all `--oi-white`. Measured body background:
`rgb(255, 255, 255)`. The old ground was #FAFAF8, which cost every text colour
about 3 per cent of its ratio for no design gain.

**2. Costs Involved paragraphs are one flat colour.** The five headings (CHARTER
FEE, APA, DELIVERY FEE, VAT, CREW GRATUITY) were Mint at 1.34:1 and their
paragraphs were 72 per cent Monochrome, so each block changed colour part-way
through. Heading and paragraph are now both `--oi-mono` at 16.86:1, so each
block reads as a single flat colour. There was no gradient or colour transition
in the markup; the shift came from the two different colours. No anchor styling
is inherited inside those paragraphs.

**3. Cost table.** Label `--oi-graphite` 7.26:1, amount `--oi-mono` 16.86:1.
Both label and amount now render at weight 500, so no figure is lighter than
its label. The TOTAL row is `--oi-mono` at weight 700 for both label and
amount. Weight is carried by the `--figure-weight` and `--total-weight` tokens
so the dark theme keeps its original weights.

**4. Spec table values.** GUESTS, CREW, STATEROOMS, CRUISING AREA, LENGTH and
YEAR / REFIT are `--oi-mono` at 16.86:1, set explicitly rather than inherited,
with a comment marking them as data rather than accents.

**5. Carousel micro-labels.** `--oi-graphite` at 7.26:1, lifted from 8.5px to
11px, with letter-spacing cut by 20 per cent (0.30em to 0.24em on the stat
labels, 0.28em to 0.224em on the cruising-area line, 0.34em to 0.27em on the
sound label). The carousel counter went from 9.5px/0.40em to 11px/0.32em.
Sizes and tracking are tokens, so the dark theme keeps 8.5px.

**6. Pagination.** Active indicator `--oi-mono` 16.86:1, inactive `--oi-grey`
2.85:1. Grey is specified for inactive fills and these indicators carry no
text. The state information is carried by the "01 OF 10" counter, which is
`--oi-graphite` text at 7.26:1.

**7. Inactive card pricing is suppressed, not dimmed.** The cards behind the
front one now carry a `cardBack` class and their rate line is hidden outright
in the light theme. Measured: front card price `visible`, cards behind it
`hidden`. Space is reserved, so nothing shifts as the ring turns.

**8. Footer.** Consultant name `--oi-mono` 16.86:1. Role line
`--oi-graphite` 7.26:1. Phone and email `--oi-mono` 16.86:1 with a Mint
underline. WhatsApp button border `--oi-graphite` 7.26:1 with an `--oi-mono`
label at 16.86:1. EXPLORE ALL 2027 DESTINATIONS is `--oi-mono` at 16.86:1 with
a Mint arrow — see the flag below.

**9. Link affordance is never colour alone.** Every link carries a visible
underline at full opacity: VIEW BROCHURE (2px Mint), VIEW YOUR SUGGESTED
ITINERARY (1px Mint), the email address (1px Mint), the compare action (1.5px
Mint) and EXPLORE ALL 2027 DESTINATIONS (1px Mint, newly added — it previously
had no underline in either theme).

## Flags

**One element still fails its target, by instruction.**

| Element | Colour | Ground | Ratio | Target |
|---|---|---|---|---|
| The arrow glyph in EXPLORE ALL 2027 DESTINATIONS | #A7E6D7 | #FFFFFF | 1.41:1 | 3:1 |

The brief specifies "EXPLORE ALL 2027 DESTINATIONS --oi-mono with a --oi-mint
arrow", so it is built that way. On White the arrow is effectively invisible.
The label beside it is Monochrome at 16.86:1 and the link carries a Mint
underline, so the affordance does not depend on the arrow. If you would rather
it passed, changing one line in the tokens file (`--link-arrow` from
`var(--oi-mint)` to `var(--oi-mono)`) puts the arrow at 16.86:1 and leaves the
Mint underline as the accent. Say the word and I will make that change.

**Neutral surfaces below 3:1, all of them non-text.** These carry no contrast
requirement under the brief, and are listed for completeness: spec table
dividers (Grey at half strength, #CCCCCD, 1.60:1), card borders and inactive
pagination (Grey, #99999A, 2.85:1), the TOTAL rule and the vertical rule beside
the broker note (Mint, #A7E6D7, 1.41:1), and the floor ring under the carousel
(Mint). Three hover washes and the image placeholder use Grey at 6 to 18 per
cent alpha; they sit behind nothing but photographs and hover states.

**Two judgement calls you may want to overrule.**

The brief assigns "APA, DELIVERY FEE, VAT" to Graphite in the role list, and
also tells fix 2 to set the APA, CHARTER FEE, DELIVERY FEE, VAT and CREW
GRATUITY paragraphs to Monochrome. Those are two different places in the page.
I read the role list as the cost-table rows in the specification panel (which is
what fix 3 describes, label in Graphite) and fix 2 as the Costs Involved
accordion, where the same words are headings above explanatory paragraphs. So
the cost-table labels are Graphite and the Costs Involved headings are
Monochrome. Both pass their targets either way.

TOTAL renders at weight 700. No 700-weight Gotham sans face is loaded — only
Light 300, Book 400 and Medium 500 — so the browser synthesises the bold. It is
visibly heavier than the 500-weight figures above it, which is what fix 3 asks
for. Dropping `Gotham-Bold.ttf` into `/public/fonts` would make it a real face.

## The dark theme is untouched

Proven by measurement, not by inspection. The same 57-element audit was run
against a published dark-theme page twice: once with these changes reverted and
once with them applied. Every measured colour, composited background, font
size, weight, letter-spacing and visibility is identical across the two runs,
with two exceptions, both of which render identically:

- The EXPLORE ALL 2027 DESTINATIONS underline now resolves to Mint rather than
  inheriting the text colour, but its width token is `0` in the dark theme, so
  no border is painted.
- The arrow glyph is now wrapped in its own span. In the dark theme
  `--link-arrow` is `currentColor`, and the span measures #757778, exactly the
  colour the surrounding link already had.

## Files changed

| File | Change |
|---|---|
| `selection-app/src/app/theme-tokens.css` | New. The whole colour layer for both themes: the five brand colours, the dark theme's values as shipped, and the rebuilt light theme |
| `selection-app/src/app/globals.css` | Imports the tokens file; its own `:root` and `[data-theme="light"]` blocks removed; link hover uses a token |
| `selection-app/src/components/SpecPanel.module.css` | Colour literals replaced with role tokens; the three-selector light override deleted; figure weights tokenised |
| `selection-app/src/components/RingCarousel.module.css` | Same; micro-label size and tracking tokenised; inactive-card price suppression; cruising-area line clamped to two lines in the light theme |
| `selection-app/src/components/CollapsibleSections.module.css` | Same; the cost-label light override deleted |
| `selection-app/src/components/Cover.module.css` | Same; the eyebrow light override deleted |
| `selection-app/src/components/ConsultantBlock.module.css` | Same; explore link gains a tokenised underline and an arrow class |
| `selection-app/src/components/Compare.module.css` | Same |
| `selection-app/src/components/EnlargeableImage.module.css` | Overlay chrome moved onto Monochrome and White tokens |
| `selection-app/src/components/icons.tsx` | Every SVG stroke now reads a token instead of a mint literal |
| `selection-app/src/components/RingCarousel.tsx` | Cards behind the front one carry a `cardBack` class |
| `selection-app/src/components/ConsultantBlock.tsx` | The arrow glyph is wrapped so it can be coloured separately |

Four `[data-theme="light"]` rules remain in `RingCarousel.module.css`. None of
them sets a colour: they remove the card scrim, mask the image fade, move the
yacht name into normal flow, and hide the rate on inactive cards.

## How to review this

Open a light-theme selection page on the Vercel preview. The theme control is
in section 03 of the consultant form; existing published pages keep whichever
theme they were published with.

Worth looking at specifically:

1. The cost table in the specification panel. Labels grey-dark, figures black
   and no lighter than the labels, TOTAL heavier than the rows above it.
2. The 01–04 highlight markers, now mint chips with black numerals.
3. The Costs Involved section. Each heading and its paragraph are the same
   black, so no block changes colour part-way down.
4. The carousel as it turns. Only the front card shows a rate.
5. The footer links. Each one has a mint underline. The arrow after EXPLORE ALL
   2027 DESTINATIONS is the one element that is deliberately near-invisible.
6. A narrow window, around 390px. The card micro-labels are 11px and the
   cruising-area line ellipsises rather than being clipped by the card edge.

## Verification run

- 57-element contrast audit against a published two-yacht light page: all
  assertions pass, one element below target by instruction.
- Same audit against a dark page, before and after: identical.
- Existing image-picker and publish suite: 28 assertions pass.
- No horizontal overflow and no clipped card content at 390px.
- TypeScript compiles clean.
