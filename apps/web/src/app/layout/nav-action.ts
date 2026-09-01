/**
 * Shared look for the navbar's action controls (catalogue, cart, account), in
 * the two shapes the app draws them in.
 *
 * `bar` is the header's row, from `sm` up: an icon over a small caption,
 * aligned with the search field beside it. `tab` is the bottom bar below `sm`:
 * five evenly divided glyphs, captioned for assistive technology only. Five
 * words across a phone would each be a different length, and a row of tabs
 * that are the same size but not the same shape reads as crooked — the glyphs
 * alone sit on an even rhythm.
 *
 * Only one of the two is ever in the document — the group that is not in use
 * is `display:none`, so its controls are out of the accessibility tree as well
 * as off the screen. That is what lets each shape be written plainly, with no
 * responsive prefixes trying to be both at once.
 *
 * Active state is driven by `aria-current="page"` rather than by
 * `routerLinkActive` classes: an attribute selector outranks a plain class, so
 * it wins regardless of the order Tailwind emits utilities in — and it is the
 * signal a screen reader announces as "current page".
 *
 * `active:` is the press: `primary-deep`, the app's press colour everywhere.
 * Hover is accent and only exists where there is a pointer — Tailwind's
 * `hover:` carries `(hover: hover)` — so a touch goes straight to the press,
 * and a cursor goes through accent on the way to it.
 *
 * The current control also thickens its glyph. A caption at medium weight is
 * the header's tell and it is the one thing the bottom bar cannot use, since
 * its captions are for screen readers only; carrying the weight in the glyph
 * as well says the same thing in both shapes.
 */
export type NavVariant = 'bar' | 'tab';

const SHARED =
  'group flex flex-col items-center text-primary transition-colors hover:text-accent active:text-primary-deep aria-[current=page]:font-medium aria-[current=page]:[--icon-stroke-width:2.25]';

/**
 * Header row. The padding is what it is so the icon and its caption together
 * take exactly the 40px the search field beside them takes, on the same two
 * edges: 24px of glyph over a 16px row. The controls are not centred against
 * the bar or the wordmark — they are aligned with the field, which is the thing
 * they stand next to and the only other object in the row with a visible box.
 *
 * The captions, and the fixed width that goes with them, wait for `md`. In the
 * band below it the row is already carrying a wordmark, a search field and
 * three controls across 640px, and three words are the part of that the field
 * can least afford — a glyph says the same thing in a third of the width. What
 * the caption said out loud, the control still says to a screen reader.
 *
 * From `md` the fixed minimum width and the fixed caption row keep the group's
 * icons on one axis and its captions on another whatever any one control
 * happens to be showing. Without both, the cart's total chip — taller and
 * wider than a caption — would push its own icon up out of line and shove its
 * neighbours sideways the moment a first product is added.
 */
const BAR = `${SHARED} rounded-lg px-3 py-2.5 md:min-w-18`;

/**
 * What a tab shows when it is the one in use: the disc behind the glyph, and
 * the same heavier stroke `aria-current` gives the tabs that are links. Kept
 * separate because two of the five tabs are not routes — the search field and
 * the panel are states of this bar, and `aria-current="page"` on a button that
 * goes nowhere would tell a screen reader something untrue.
 */
export const TAB_CURRENT = 'before:bg-primary/10 [--icon-stroke-width:2.25]';

/**
 * Bottom bar. Each control takes an equal share of the width and the whole tab
 * is the tap target, so there is no minimum to set and no field to align with.
 * `flex-1` is on the control itself, which means the element that hosts it has
 * to be a flex item of the bar and pass the share on — see BottomNav, which
 * also sets the row's height for all five to fill.
 *
 * Press and current state are drawn behind the glyph rather than in it, which
 * is what the header can get away with: a thumb covers a fifth of a phone's
 * width, so a colour shift inside a 24px glyph happens under the hand that
 * caused it. A 36px disc around the glyph is still visible past a fingertip,
 * and it is a shape the row can carry five of without becoming a row of
 * blocks.
 *
 * The current tab tints its disc and thickens its glyph; it does not recolour
 * it. Accent is hover across the whole app, and a mouse in a narrow window
 * would otherwise make every tab it passes over look like the page you are on.
 * The press deepens the same disc, so it reads as the current tab answering
 * rather than as a second mark appearing next to the first.
 */
const TAB =
  `${SHARED} relative isolate flex-1 justify-center rounded-lg ` +
  // The disc, drawn as the tab's own ::before rather than as a wrapper around
  // each glyph — five controls in three components would each need the same
  // box. Centred on the tab, which is where the icon is: the caption below it
  // is `sr-only`, so it takes no room and nothing pulls the glyph off centre.
  // Behind the icon, and `isolate` so that `-z-10` cannot reach past the tab
  // and hide under the bar's own surface.
  `before:absolute before:top-1/2 before:left-1/2 before:-z-10 before:h-9 before:w-9 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:transition-colors before:content-[''] ` +
  // `not-active` because the two rules are the same weight and Tailwind emits
  // the press first, so the current tab would keep its own disc under a
  // thumb — the one tab where the press most needs to be visible.
  `active:before:bg-primary/20 aria-[current=page]:not-active:before:bg-primary/10`;

/**
 * Wrapper for whatever a control puts under its icon — a caption, or the
 * cart's chip. `contents` wherever the caption is `sr-only`, so the wrapper
 * does not exist there; from `md` the header reserves the row's height, which
 * is what keeps the icons aligned.
 */
const BAR_LABEL_ROW =
  'contents md:flex md:h-4 md:items-center md:justify-center';
/** `contents`, so the wrapper does not exist where its caption is `sr-only`. */
const TAB_LABEL_ROW = 'contents';

/**
 * The caption itself — visible in the header, and the tab's accessible name
 * below it. `text-stable` reserves the active (medium) weight's
 * width — see styles.css — so a control does not grow when its route becomes
 * current; call sites must set `data-label` to the same text.
 *
 * The header caption's negative side margins let a long word claim half of the
 * control's own 12px paddings, the way the cart's chip claims all of it: the
 * padding is there to keep the glyph off its neighbours, and the caption
 * sitting under the glyph needs less of it than the glyph does. A word
 * therefore has 60px of the 72px control before the control grows and pushes
 * the row around — and it still cannot touch the control next to it.
 */
const BAR_LABEL =
  'text-stable sr-only text-xs leading-none md:not-sr-only md:-mx-1.5';
const TAB_LABEL = 'sr-only';

/** The three class strings a nav control needs, for one of the two shapes. */
export function navActionClasses(variant: NavVariant): {
  action: string;
  labelRow: string;
  label: string;
} {
  return variant === 'tab'
    ? { action: TAB, labelRow: TAB_LABEL_ROW, label: TAB_LABEL }
    : { action: BAR, labelRow: BAR_LABEL_ROW, label: BAR_LABEL };
}
