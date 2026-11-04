/**
 * The navbar's action controls in their two shapes: `bar`, the header's icon
 * over a caption from `sm`, and `tab`, the bottom bar's evenly divided glyphs
 * captioned for screen readers only. Only one group is in the document at a
 * time. Current is `aria-current="page"`, which outranks a class whatever
 * order Tailwind emits; it also thickens the glyph, the one mark both shapes
 * can show.
 */
export type NavVariant = 'bar' | 'tab';

const SHARED = `group flex flex-col items-center text-primary
                transition-colors
                hover:text-accent
                active:text-primary-press
                aria-[current=page]:font-medium
                aria-[current=page]:[--icon-stroke-width:2.25]`;

/**
 * Padded so glyph and caption take the search field's 40px, on its edges.
 * Captions wait for `md`, where the row has room; from there the minimum width
 * and fixed caption row keep icons and captions on one axis each, whatever the
 * cart's chip shows.
 */
const BAR = `${SHARED} rounded-lg px-3 py-2.5 md:min-w-18`;

/** The current look for the two tabs that are states, not routes, where
 * `aria-current="page"` would say something untrue. */
export const TAB_CURRENT = 'before:bg-primary/10 [--icon-stroke-width:2.25]';

/**
 * An equal share of the bar, the whole tab the target; its host passes the
 * `flex-1` on (BottomNav). Press and current are a disc behind the glyph, which
 * a thumb does not hide, and current never recolours it, as accent is hover.
 */
const TAB =
  `${SHARED} relative isolate flex-1 justify-center rounded-lg ` +
  // The disc as ::before, centred where the glyph is; `isolate` keeps -z-10
  // from sinking under the bar.
  `before:absolute before:top-1/2 before:left-1/2 before:-z-10 before:h-9
   before:w-9 before:-translate-x-1/2 before:-translate-y-1/2
   before:rounded-full before:transition-colors before:content-[''] ` +
  // `not-active`: Tailwind emits the press first, which current would hide.
  `active:before:bg-primary/20 aria-[current=page]:not-active:before:bg-primary/10`;

/** Under the icon: a caption or the cart's chip, in a row that from `md`
 * reserves its height. */
const BAR_LABEL_ROW =
  'contents md:flex md:h-4 md:items-center md:justify-center';
/** `contents`, so the wrapper does not exist where its caption is `sr-only`. */
const TAB_LABEL_ROW = 'contents';

/**
 * `text-stable` reserves the medium weight's width from `data-label`, which a
 * call site sets to the same text, and centred it thickens in place. The
 * negative margins lend a long word half of the control's padding.
 */
const BAR_LABEL = `text-stable sr-only text-center text-xs leading-none
                   md:not-sr-only md:-mx-1.5`;
const TAB_LABEL = 'sr-only';

/** A text link among the page links, header and footer alike: medium and
 * primary when current, its width held by `text-stable` and `data-label`. */
export const PAGE_LINK = `text-stable transition-colors
                          hover:text-accent
                          active:text-primary-press
                          aria-[current=page]:font-medium
                          aria-[current=page]:text-primary`;

/** The class strings a nav control needs, for one shape. */
export function navActionClasses(variant: NavVariant): {
  action: string;
  labelRow: string;
  label: string;
} {
  return variant === 'tab'
    ? { action: TAB, labelRow: TAB_LABEL_ROW, label: TAB_LABEL }
    : { action: BAR, labelRow: BAR_LABEL_ROW, label: BAR_LABEL };
}
