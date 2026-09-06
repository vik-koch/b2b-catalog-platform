/**
 * The dashed area that says "a file goes here".
 *
 * There were three of these and they were three different things: the image
 * tile on a product and a category (a 1px dash, lighting its border and its
 * text), the CSV drop target on the sync screen (a 2px dash, lighting its
 * border and its ground), and the document editor's file chooser, which was a
 * plain button and so did not read as a target at all. Same gesture, same
 * promise, so one treatment — and it is the heavier dash that survives, since
 * the whole point of the dash is to be seen as a boundary from across a form.
 *
 * The size is the caller's: a tile is 7rem square, a drop target on the sync
 * screen is the width of the form.
 */
export const DROP_ZONE =
  'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md ' +
  'border-2 border-dashed text-center text-subtle transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/**
 * What it is doing. `dragging` is the only state that fills the box — a file
 * is over it and about to land; `filled` is the resting look of a target that
 * already holds something, which no longer invites a pointer the way an empty
 * one does.
 */
export function dropZoneState(dragging: boolean, filled = false): string {
  if (dragging) return 'border-primary bg-primary/5 text-accent';
  return filled
    ? 'border-border-strong bg-stone-50'
    : 'border-border-strong hover:border-primary hover:bg-stone-50 hover:text-accent';
}
