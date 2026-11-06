/**
 * A small count on a glyph's top-right corner, inside a `relative` box around
 * the glyph: the cart's lines, a grid's filters in effect. The caller adds
 * the display and the fill, which say what the count is: waiting work is
 * `bg-warning-dot`. White on it reads; dark digits look foreign.
 */
export const COUNT_DOT = `absolute -top-0.75 -right-2 h-3 min-w-3 items-center
                          justify-center rounded-full p-0.5 text-[0.625rem]/3
                          font-normal text-white`;
