/**
 * Shared look for the main navbar's action controls (account, phone, and the
 * cart/search that join them later): an icon over a small label, stacked.
 *
 * Three rules encoded here:
 * - The label is `sr-only` below `md` and visible above it, so the *visible*
 *   text is also the accessible name — no aria-label to keep in sync, and no
 *   double announcement on desktop.
 * - Desktop padding is what it is so the icon and its caption together take
 *   exactly the 40px the search field beside them takes, on the same two
 *   edges: 24px of glyph over a 16px row. The controls are not centred against
 *   the bar or the wordmark — they are aligned with the field, which is the
 *   thing they stand next to and the only other object in the row with a
 *   visible box. Mobile padding is generous instead (~44px target), because
 *   the label is hidden there and the icon is the entire tap target.
 * - On desktop the controls are a fixed minimum width and their second row a
 *   fixed height, so the row's icons sit on one axis and its labels on
 *   another whatever any one control happens to be showing. Without both, the
 *   cart's total chip — taller and wider than a label — would push its own
 *   icon up out of line and shove its neighbours sideways the moment a first
 *   product is added. The row is exactly as tall as that chip, which also
 *   leaves the chip no leftover space to be centred in — see styles.css on
 *   why a pixel of it would land unevenly.
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
export const NAV_ACTION =
  'group flex flex-col items-center rounded-lg p-3 text-primary transition-colors hover:text-accent active:text-secondary md:min-w-18 md:px-3 md:py-2.5 aria-[current=page]:stroke-3 aria-[current=page]:font-medium';

/**
 * Wrapper for whatever a control puts under its icon — a label, or the cart's
 * chip. `contents` on mobile so the wrapper does not exist where the label is
 * `sr-only`; a fixed row above it, which is what keeps the icons aligned.
 */
export const NAV_ACTION_LABEL_ROW =
  'contents md:flex md:h-4 md:items-center md:justify-center';

/**
 * Label inside a NAV_ACTION control that has a desktop counterpart. `text-stable`
 * reserves the active (medium) weight's width — see styles.css — so the control
 * does not grow when its route becomes current. Call sites must set
 * `data-label` to the same text.
 *
 * The negative side margins let a long caption claim half of the control's own
 * 12px paddings, the way the cart's chip claims all of it: the padding is there
 * to keep the glyph off its neighbours, and the caption sitting under the glyph
 * needs less of it than the glyph does. A word therefore has 60px of the 72px
 * control before the control grows and pushes the row around — and it still
 * cannot touch the control next to it.
 */
export const NAV_ACTION_LABEL =
  'text-stable sr-only text-xs leading-none md:not-sr-only md:-mx-1.5';
