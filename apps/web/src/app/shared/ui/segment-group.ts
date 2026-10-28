import { computed, Directive, input } from '@angular/core';

/**
 * `brand` is a pill in an edge, for a choice that decides something; `neutral`
 * a grey track, the chosen segment a white chip, for one that only arranges
 * what is on the page. The padding against `rounded-lg` sets each tone's
 * segment radius, so the corners stay concentric.
 */
const tones = {
  brand: 'inline-flex gap-1 rounded-lg border border-edge-strong bg-white p-1',
  neutral: 'inline-flex gap-0.5 rounded-lg bg-surface p-0.5',
} as const;

export type SegmentTone = keyof typeof tones;

/**
 * The pill around a row of `appSegment`s, whose look follows its tone. For a
 * row of radios, Segmented builds both.
 *
 *   <div appSegmentGroup tone="neutral" role="group">
 *     <button appSegment state="selected">…</button>
 *   </div>
 */
@Directive({
  selector: '[appSegmentGroup]',
  host: { '[class]': 'classes()' },
})
export class SegmentGroup {
  readonly tone = input<SegmentTone>('brand');

  protected readonly classes = computed(() => tones[this.tone()]);
}
