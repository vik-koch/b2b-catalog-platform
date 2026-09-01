/**
 * The width below which a listing gives up on columns of any kind: one product
 * to a line, whichever layout the visitor chose.
 *
 * It is the app's one narrow threshold, and it is set where the rest of the
 * page already turns: 593px is what a window at the `sm` breakpoint (640px)
 * leaves once the frame's padding and a scrollbar come off, so the listing
 * takes its narrow shape in the same drag of the window edge that shrinks the
 * heading above it and drops the filter chips. Two thresholds a few dozen
 * pixels apart made one resize rearrange the page twice.
 *
 * A px figure rather than a round number of rem, because it is arithmetic and
 * exact to the pixel: `@max` is a strict comparison and `@min` is not, so the
 * two share one figure and partition on it. A viewport with no classic
 * scrollbar — a phone, a trackpad — leaves the listing 15px wider at the same
 * window width, so it holds the wide shape a little past the point where the
 * heading shrinks; on one of those the window is usually far below either
 * figure anyway.
 *
 * Comfortably above the floor, which is what a line needs to hold a thumbnail
 * and two columns of buying controls beside it — 5rem of photo, a 1rem gap and
 * the controls' own 28.5rem.
 *
 * Both layouts leave the shape at the same width, which is the point: below it
 * a card and a line are the same drawing, and above it each becomes itself.
 * Measured on the listing, not the window, so a listing beside the filter
 * panel counts its own width.
 */
export const LISTING_NARROW = '593px';

/**
 * The classes that make a card and a line the same drawing below
 * `LISTING_NARROW`: the photo on the left at whatever width the controls
 * beside it do not need, and a body column that will not be squeezed under
 * what the buying controls cost.
 *
 * Each pair is written out twice because the two components ask two different
 * containers — a card measures the listing around it, a line measures itself,
 * since a cart line has no listing to measure — and a container name cannot be
 * interpolated into a class without putting it past Tailwind's scanner. So the
 * strings live here, next to each other, and a spec holds each pair to being
 * one string modulo that name. Two components that merely agreed by hand is
 * what let the card's photo lose its frame.
 */
export const NARROW_PHOTO_IN_GRID =
  '@max-[593px]/listing:w-auto @max-[593px]/listing:min-w-16 @max-[593px]/listing:max-w-48 @max-[593px]/listing:flex-1 @max-[593px]/listing:shrink @max-[593px]/listing:self-start';
export const NARROW_PHOTO_IN_LINE =
  '@max-[593px]/line:w-auto @max-[593px]/line:min-w-16 @max-[593px]/line:max-w-48 @max-[593px]/line:flex-1 @max-[593px]/line:shrink @max-[593px]/line:self-start';

/** The name and the buying controls beside the photo, at the width they need
 * before the line is worth drawing at all. */
export const NARROW_BODY_IN_GRID = '@max-[593px]/listing:min-w-52';
export const NARROW_BODY_IN_LINE = '@max-[593px]/line:min-w-52';

/** The room a product takes above and below it in the narrow shape, where it
 * is a line on the page rather than a card with a ground of its own: a little
 * more than a line in a list, since there is no frame around it to say where
 * one product ends and the next begins. */
export const NARROW_PADDING_IN_GRID = '@max-[593px]/listing:py-4';
export const NARROW_PADDING_IN_LINE = '@max-[593px]/line:py-4';
