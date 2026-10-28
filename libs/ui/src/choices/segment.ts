import { computed, Directive, inject, input } from '@angular/core';
import { SegmentGroup, type SegmentTone } from './segment-group';

const base = `text-center transition-colors select-none
              has-[:focus-visible]:outline-1
              has-[:focus-visible]:outline-offset-2
              has-[:focus-visible]:outline-secondary`;

/**
 * The chosen segment, one that can be chosen, and one that cannot but is
 * still shown: it answers a press by saying why, so it answers a pointer too.
 */
export type SegmentState = 'selected' | 'available' | 'unavailable';

/** `sm` inside something else (a card, a listing header), `md` among fields. */
const sizes = {
  sm: 'px-2 py-0.5 text-sm',
  md: 'px-4 py-1.5 text-sm font-medium',
} as const;

export type SegmentSize = keyof typeof sizes;

const brand: Record<SegmentState, string> = {
  selected: 'bg-primary text-white hover:bg-accent active:bg-primary-press',
  available: `text-ink
              hover:bg-surface-subtle-hover hover:text-accent
              active:bg-surface-subtle-press active:text-primary`,
  unavailable: `text-ink-subtle
                hover:bg-surface-subtle-hover
                active:bg-surface-subtle-press`,
};

/** The quiet pill: the chip is the fill, and every segment hovers as a ghost. */
const neutral: Record<SegmentState, string> = {
  selected: `bg-white text-ink shadow-xs
             hover:text-accent
             active:text-primary-press`,
  available: `text-ink-subtle
              hover:bg-surface-hover hover:text-accent-strong
              active:bg-surface-press active:text-primary-press`,
  unavailable: 'text-ink-subtle hover:bg-surface-hover active:bg-surface-press',
};

const palettes: Record<SegmentTone, Record<SegmentState, string>> = {
  brand,
  neutral,
};

/** Concentric with the group's corners: see SegmentGroup. */
const radii: Record<SegmentTone, string> = {
  brand: 'rounded',
  neutral: 'rounded-md',
};

/** A pill where nothing can be chosen keeps its reading and drops every affordance. */
const locked: Record<SegmentState, string> = {
  selected: 'bg-ink-disabled text-white',
  available: 'text-ink-disabled',
  unavailable: 'text-ink-disabled',
};

const cursors = {
  free: 'cursor-pointer',
  locked: 'cursor-not-allowed',
} as const;

const growing = 'flex-auto';

/**
 * One segment of an `appSegmentGroup`, drawn in its group's tone. A radio's
 * label or a button, so a segment can be pressed for something other than
 * choosing it.
 */
@Directive({
  selector: '[appSegment]',
  host: { '[class]': 'classes()' },
})
export class Segment {
  private readonly group = inject(SegmentGroup, { optional: true });

  readonly state = input<SegmentState>('available');
  readonly size = input<SegmentSize>('sm');
  /** A share of a full-width group in proportion to its label, not an equal one. */
  readonly grow = input(false);
  readonly locked = input(false);

  protected readonly classes = computed(() => {
    const tone = this.group?.tone() ?? 'brand';
    return `${base} ${radii[tone]} ${sizes[this.size()]} ${this.look(tone)}
            ${this.grow() ? growing : ''}`;
  });

  private look(tone: SegmentTone): string {
    const state = this.state();
    if (this.locked()) return `${cursors.locked} ${locked[state]}`;
    return `${cursors.free} ${palettes[tone][state]}`;
  }
}
