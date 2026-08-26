/**
 * Shared look for a segmented choice — multiple mutually exclusive options
 * shown side by side in one pill, rather than as a dropdown or a column of
 * radios. Class strings rather than a component, the way NAV_ACTION is: the
 * call sites bind their radios through very different mechanisms (a reactive
 * form control on the registration and inquiry forms, a plain signal in the
 * buying block), and a wrapper component would have to grow a
 * ControlValueAccessor just to serve both.
 *
 * The markup each call site writes is the same shape:
 *
 *   <div role="radiogroup" [class]="SEGMENTED_GROUP">
 *     <label [class]="segmentClass(selected)">
 *       <input type="radio" class="sr-only" … />
 *       Label
 *     </label>
 *   </div>
 *
 * The radio itself stays a real radio, hidden rather than replaced: arrow-key
 * navigation, the group semantics and the focus ring all come from the
 * platform, and `has-[:focus-visible]` puts that ring on the segment.
 */
const SEGMENT_BASE =
  'rounded-md px-2 py-0.5 text-center text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-secondary';

/** The pill around the segments, sized to its content. */
export const SEGMENTED_GROUP =
  'inline-flex gap-1 rounded-lg border border-border-strong bg-white p-1';

/** What a segment is: the chosen one, one that can be chosen, or one the
 * product is not sold in — shown rather than hidden, so every card offers the
 * same three units in the same places, and saying why is the segment's job. */
export type SegmentState = 'selected' | 'available' | 'unavailable';

/**
 * `grow` lets a segment take its share of a full-width group: `flex-auto`
 * rather than `flex-1`, so segments divide the row in proportion to their
 * labels. Equal thirds only look right in the one language the labels were
 * written in.
 */
export function segmentClass(state: SegmentState, grow = false): string {
  const states: Record<SegmentState, string> = {
    selected: 'cursor-pointer bg-primary text-white',
    available: 'cursor-pointer text-ink hover:bg-stone-100',
    unavailable: 'cursor-pointer text-stone-400 hover:bg-stone-50',
  };
  return `${SEGMENT_BASE} ${states[state]}${grow ? ' flex-auto' : ''}`;
}
