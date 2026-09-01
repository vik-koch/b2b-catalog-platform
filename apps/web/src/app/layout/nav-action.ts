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
 * `active:` is the press, and it is secondary rather than primary: primary is
 * where the control already rests, so pressing it would look like nothing
 * happened, and it is what the current page's own label uses.
 */
export type NavVariant = 'bar' | 'tab';

const SHARED =
  'group flex flex-col items-center text-primary transition-colors hover:text-accent active:text-secondary aria-[current=page]:stroke-3 aria-[current=page]:font-medium';

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
 * Bottom bar. Each control takes an equal share of the width and the whole tab
 * is the tap target, so there is no minimum to set and no field to align with.
 * `flex-1` is on the control itself, which means the element that hosts it has
 * to be a flex item of the bar and pass the share on — see BottomNav, which
 * also sets the row's height for all five to fill.
 */
const TAB = `${SHARED} flex-1 justify-center rounded-md`;

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
