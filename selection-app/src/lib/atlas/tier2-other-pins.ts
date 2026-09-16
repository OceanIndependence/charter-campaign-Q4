/**
 * Tier 2 globe — whether the rest of the Atlas is drawn around the shortlist.
 *
 * The Personalised Atlas was built to pin the consultant's chosen
 * destinations bright and every other Atlas destination dimmed but clickable
 * ("beyond the shortlist"). This flag turns that second set off, so the globe
 * carries the chosen destinations and nothing else.
 *
 * Temporary, by request (16 September 2026). Everything the dimmed pins need
 * is still in place and still published: `otherPins` is resolved, frozen into
 * every published page config and passed to the page as before — only the
 * render is gated. Set this back to `true` to restore the original globe; no
 * other file has to change and no page has to be republished.
 *
 * See `docs/tier2-other-pins-hidden.md`.
 */
export const SHOW_OTHER_PINS: boolean = false;
