/**
 * The hairline around a product photo, or around the card one sits on: a shot
 * on a white ground has no edge of its own.
 *
 * A ring rather than a border or an inset ring, and the difference is the
 * corners.
 *
 * An inset ring is painted inside the box, over the photo filling it, and
 * along the corner arcs the photo's antialiased edge lands a fraction of a
 * pixel outside the line — so the frame is eaten there and the corner reads as
 * a thicker, darker piece of photo. A real border fixes that (the browser
 * derives the clipping curve from the border curve, so they are concentric by
 * construction) but costs a pixel of layout on each side, which a card holding
 * a fixed-width control cannot spare.
 *
 * A ring is painted outside the box. The photo cannot overshoot a line it is
 * nowhere near, the arc stays solid, and nothing moves: the card keeps its
 * width and the photo keeps its own. `ring` rather than a bare `box-shadow`
 * so it composes with the shadow a card raises on hover.
 */
export const FRAME = 'ring-1 ring-border';

/** The frame at the weight and colour that marks the chosen one of several —
 * the gallery's thumbnails. Growing outwards, so choosing one does not resize
 * the photo inside it. */
export const FRAME_SELECTED = 'bg-accent ring-2 ring-accent';
