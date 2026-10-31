/** Below this a listing is one product to a line, card and line drawn alike.
 * `sm` less the frame's padding, measured on the listing, not the window. */
export const LISTING_NARROW = '38rem';

/** Each pair twice: a card asks the listing, a line asks itself (a cart line
 * has no listing), and an interpolated container name hides from Tailwind. A
 * spec holds each pair to one string. */
export const NARROW_PHOTO_IN_GRID = `@max-[38rem]/listing:w-auto
                                     @max-[38rem]/listing:min-w-16
                                     @max-[38rem]/listing:max-w-48
                                     @max-[38rem]/listing:flex-1
                                     @max-[38rem]/listing:shrink
                                     @max-[38rem]/listing:self-start`;
export const NARROW_PHOTO_IN_LINE = `@max-[38rem]/line:w-auto
                                     @max-[38rem]/line:min-w-16
                                     @max-[38rem]/line:max-w-48
                                     @max-[38rem]/line:flex-1
                                     @max-[38rem]/line:shrink
                                     @max-[38rem]/line:self-start`;

/** 13.5rem: what the buying controls take in a card. */
export const NARROW_BODY_IN_GRID = '@max-[38rem]/listing:min-w-54';
export const NARROW_BODY_IN_LINE = '@max-[38rem]/line:min-w-54';

export const NARROW_PADDING_IN_GRID = '@max-[38rem]/listing:py-4';
export const NARROW_PADDING_IN_LINE = '@max-[38rem]/line:py-4';
