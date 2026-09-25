import { computed, Directive, input } from '@angular/core';

/**
 * What a state means, not what colour it is. Every badge in the app answers one
 * of these five, so an order awaiting an answer and an account awaiting
 * approval are the same amber, and nobody has to remember which shade of it.
 */
const tones = {
  /** Nothing is pending and nothing is wrong — history, or a plain fact. */
  neutral: 'bg-stone-200 text-muted',
  /** Somebody has to act before this moves. */
  waiting: 'bg-amber-100 text-amber-800',
  /** Settled, and settled well. */
  ok: 'bg-green-100 text-green-800',
  /** Settled by a refusal, or deliberately switched off. */
  danger: 'bg-red-100 text-red-800',
  /** A state worth pointing out that is neither good nor bad. */
  info: 'bg-sky-100 text-sky-800',
} as const;

/**
 * The same five states in the quiet variant, where the dot is the only thing
 * that carries the tone: the field is white, the border is the app's ordinary
 * hairline and the label is body-coloured whatever the state. A shelf being
 * empty is a fact about a product, not a warning about it, so in a listing the
 * badge should read at the weight of the words around it — the colour is there
 * to be scanned down a column, not to shout from inside a card.
 */
const dots = {
  neutral: 'before:bg-stone-400',
  waiting: 'before:bg-amber-500',
  ok: 'before:bg-green-500',
  danger: 'before:bg-red-500',
  info: 'before:bg-sky-500',
} as const;

export type StatusTone = keyof typeof tones;

/**
 * `solid` is the pill this started as; `dot` is the bordered variant. The dot
 * is a `::before` rather than an element so both variants stay one directive
 * with no content of their own, and no caller has to know which shape it asked
 * for beyond naming it.
 */
export type StatusBadgeVariant = 'solid' | 'dot';

const shapes = {
  solid: 'rounded-full px-2 py-0.5',
  dot:
    'gap-x-1.5 rounded-md border border-border bg-white px-2 py-0.5 text-muted ' +
    "before:size-1.5 before:shrink-0 before:rounded-full before:content-['']",
} as const;

/**
 * The pill that says what state a thing is in — an order's status, an account's,
 * a product that is off the storefront, a row a sync would change.
 *
 * One directive because these read as the same control wherever they appear: a
 * customer and a manager look at the same order, and the badge on their two
 * screens was a different shape. The wording is never shared — a customer reads
 * "Awaiting confirmation" where staff read the state itself — so the domains
 * keep their own catalogues and hand this only a tone.
 */
@Directive({
  selector: '[appStatusBadge]',
  host: { '[class]': 'classes()' },
})
export class StatusBadge {
  readonly tone = input<StatusTone>('neutral');
  readonly variant = input<StatusBadgeVariant>('solid');
  /**
   * Lets a long label break onto a second line — only where a column beside a
   * thumbnail has the height to spare and not the width (the main page's small
   * card). The lines sit closer than text does, so two of them still read as
   * one label, and the dot stays level with the first rather than drifting to
   * the middle of both.
   */
  readonly wrap = input(false);

  protected readonly classes = computed(() => {
    const variant = this.variant();
    const colours = variant === 'dot' ? dots[this.tone()] : tones[this.tone()];
    // select-none: a badge names a state, it is not text about one. See Button.
    // nowrap for the same reason: a two-word state is one label, and a narrow
    // column — a table the reader has dragged, a phone — should push it out of
    // the way rather than break it across two lines.
    const flow = this.wrap()
      ? 'items-start leading-tight before:mt-[calc(0.5lh-0.1875rem)]'
      : 'items-center whitespace-nowrap';
    return `inline-flex ${flow} text-xs font-medium select-none ${shapes[variant]} ${colours}`;
  });
}
