import { computed, Directive, input } from '@angular/core';

export type CardVariant = 'flat' | 'raised';

/**
 * Corners follow the box's standing: `lg` for anything inside the page, `xl`
 * for what stands alone over it, so the larger radius is never a coincidence.
 */
const variants = {
  flat: 'rounded-lg border border-edge bg-white',
  raised: 'rounded-xl border border-edge bg-white shadow-sm',
} as const;

/**
 * A white card with an edge. `flat` sits inside a page with other content;
 * `raised` is the page's whole task on a recessed ground. `padded` off where
 * the rows draw their own padding (a divided list reaching the edge) or the
 * padding answers the card's width.
 *
 *   <section uiCard>…</section>
 *   <ul uiCard [padded]="false" class="divide-y divide-edge">…</ul>
 */
@Directive({
  selector: '[uiCard]',
  host: { '[class]': 'classes()' },
})
export class Card {
  readonly variant = input<CardVariant>('flat');
  readonly padded = input(true);

  protected readonly classes = computed(
    () => `${variants[this.variant()]} ${this.padded() ? 'p-5' : ''}`,
  );
}
