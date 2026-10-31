import { Component, computed, inject, input } from '@angular/core';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';

export type ProductState = 'live' | 'unpublished' | 'deleted';

export function productState(product: {
  deletedAt: string | null;
  publishedAt: string | null;
}): ProductState {
  if (product.deletedAt) return 'deleted';
  return product.publishedAt ? 'live' : 'unpublished';
}

/** A linked product, which states its flags rather than its dates. */
export function linkedProductState(product: {
  deleted: boolean;
  unpublished: boolean;
}): ProductState {
  if (product.deleted) return 'deleted';
  return product.unpublished ? 'unpublished' : 'live';
}

const TONES: Record<ProductState, StatusTone> = {
  live: 'ok',
  unpublished: 'waiting',
  deleted: 'danger',
};

/** Where a product stands. Nothing for a live one unless `live` asks: a
 * linked product is assumed live. */
@Component({
  selector: 'app-product-state-badge',
  imports: [StatusBadge],
  host: { class: 'contents' },
  template: `
    @if (live() || state() !== 'live') {
      <span uiStatusBadge class="shrink-0" [tone]="tone()">{{ label() }}</span>
    }
  `,
})
export class ProductStateBadge {
  private readonly text = inject(ADMIN_TEXT).products;

  readonly state = input.required<ProductState>();
  readonly live = input(false);

  protected readonly tone = computed(() => TONES[this.state()]);
  protected readonly label = computed(() => {
    const state = this.state();
    return state === 'live' ? this.text.list.stateLive : this.text[state];
  });
}
