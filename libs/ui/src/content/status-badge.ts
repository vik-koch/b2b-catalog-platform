import { computed, Directive, input } from '@angular/core';

/** A badge names a state, so its label is not there to be selected. */
const base = 'inline-flex text-xs font-medium select-none';

/**
 * What a state means, not what colour it is: two things awaiting someone are
 * the same amber wherever they are.
 */
const tones = {
  /** Nothing pending and nothing wrong: history, or a plain fact. */
  neutral: 'bg-chip text-ink-subtle',
  /** Somebody has to act before this moves. */
  waiting: 'bg-warning-surface text-warning-ink',
  /** Settled, and settled well. */
  ok: 'bg-success-surface text-success-ink',
  /** Settled by a refusal, or deliberately switched off. */
  danger: 'bg-danger-surface text-danger-ink',
  /** A state worth pointing out that is neither good nor bad. */
  info: 'bg-info-surface text-info-ink',
} as const;

/**
 * The quiet variant, where only the dot carries the tone, so a badge reads at
 * the weight of the words around it and its colour is there to be scanned.
 */
const dots = {
  neutral: 'before:bg-ink-subtle',
  waiting: 'before:bg-warning-dot',
  ok: 'before:bg-success-dot',
  danger: 'before:bg-danger-dot',
  info: 'before:bg-info-dot',
} as const;

export type StatusTone = keyof typeof tones;

/** The dot is a `::before`, so both variants stay one directive with no content. */
const shapes = {
  solid: 'rounded-full px-2 py-0.5',
  dot: `gap-x-1.5 rounded-md border border-edge bg-white px-1.5 py-0.5
        text-ink-subtle
        before:size-1.5 before:shrink-0 before:rounded-full
        before:content-['']`,
} as const;

export type StatusBadgeVariant = keyof typeof shapes;

const colors = { solid: tones, dot: dots } as const;

/**
 * Unbroken by default. Wrapped, the lines sit close, so they still read as one
 * label, and the dot stays level with the first.
 */
const flows = {
  line: 'items-center whitespace-nowrap',
  wrap: 'items-start leading-tight before:mt-[calc(0.5lh-0.1875rem)]',
} as const;

/**
 * The badge that says what state a thing is in, one shape wherever it
 * appears. The wording is the caller's; this is handed only a tone.
 */
@Directive({
  selector: '[uiStatusBadge]',
  host: { '[class]': 'classes()' },
})
export class StatusBadge {
  readonly tone = input<StatusTone>('neutral');
  readonly variant = input<StatusBadgeVariant>('solid');
  /**
   * Lets a long label take a second line, where a column has height to spare
   * and not width.
   */
  readonly wrap = input(false);

  protected readonly classes = computed(() => {
    const variant = this.variant();
    return `${base} ${flows[this.wrap() ? 'wrap' : 'line']} ${shapes[variant]}
            ${colors[variant][this.tone()]}`;
  });
}
