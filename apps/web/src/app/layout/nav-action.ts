/**
 * Shared look for the main navbar's action controls (account, phone, and the
 * cart/search that join them later): an icon over a small label, stacked.
 *
 * Two rules encoded here:
 * - The label is `sr-only` below `md` and visible above it, so the *visible*
 *   text is also the accessible name — no aria-label to keep in sync, and no
 *   double announcement on desktop.
 * - Padding is generous on mobile (~44px target) because the label is hidden
 *   there and the icon is the entire tap target; desktop can be tighter since
 *   the label enlarges the box.
 *
 * Active state is driven by `aria-current="page"` rather than by
 * `routerLinkActive` classes: an attribute selector outranks a plain class, so
 * it wins regardless of the order Tailwind emits utilities in — and it is the
 * signal a screen reader announces as "current page".
 */
export const NAV_ACTION =
  'flex flex-col items-center gap-0.5 rounded-lg p-3 text-primary transition-colors hover:text-accent md:px-3 md:py-1.5 aria-[current=page]:stroke-3 aria-[current=page]:font-medium';

/** Label inside a NAV_ACTION control that has a desktop counterpart. */
export const NAV_ACTION_LABEL =
  'sr-only text-xs leading-none md:not-sr-only';
