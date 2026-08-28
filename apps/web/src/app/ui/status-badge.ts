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

export type StatusTone = keyof typeof tones;

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

  protected readonly classes = computed(
    () =>
      `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[this.tone()]}`,
  );
}
