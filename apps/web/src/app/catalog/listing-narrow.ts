/**
 * The width below which a listing gives up on columns of any kind: one product
 * to a line, whichever layout the visitor chose. Below it a card and a line are
 * the same drawing; above it each becomes itself.
 *
 * The `sm` breakpoint (40rem) less the page frame's padding, so the listing
 * turns in the same drag of the window edge that shrinks the heading above it
 * and drops the filter chips. Measured on the listing, not the window: a
 * listing beside the filter panel counts its own width, and a scrollbar costs
 * it a few more pixels the media query cannot see.
 */
export const LISTING_NARROW = '38rem';

/**
 * The classes that make the two the same drawing: the photo on the left at
 * whatever width the controls do not need, a body column that will not be
 * squeezed under what they cost, and the room a product takes with no frame
 * around it to separate it from the next one.
 *
 * Each pair is written out twice because a card asks the listing around it and
 * a line asks itself — a cart line has no listing to ask — and a container name
 * cannot be interpolated into a class without hiding it from Tailwind's
 * scanner. So they sit here side by side, and a spec holds each pair to one
 * string modulo that name: agreeing by hand is what let the card's photo lose
 * its frame.
 */
export const NARROW_PHOTO_IN_GRID =
  '@max-[38rem]/listing:w-auto @max-[38rem]/listing:min-w-16 @max-[38rem]/listing:max-w-48 @max-[38rem]/listing:flex-1 @max-[38rem]/listing:shrink @max-[38rem]/listing:self-start';
export const NARROW_PHOTO_IN_LINE =
  '@max-[38rem]/line:w-auto @max-[38rem]/line:min-w-16 @max-[38rem]/line:max-w-48 @max-[38rem]/line:flex-1 @max-[38rem]/line:shrink @max-[38rem]/line:self-start';

export const NARROW_BODY_IN_GRID = '@max-[38rem]/listing:min-w-52';
export const NARROW_BODY_IN_LINE = '@max-[38rem]/line:min-w-52';

export const NARROW_PADDING_IN_GRID = '@max-[38rem]/listing:py-4';
export const NARROW_PADDING_IN_LINE = '@max-[38rem]/line:py-4';
