import { Component, computed, inject, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { LINK_BASE, LINK_TONES } from '../../ui/link';

/**
 * How many of a product count are not on the storefront, beside that count:
 * the gap behind it, in amber like the grid's content gaps, because each one
 * is waiting on an admin. The link opens the same narrowed grid as the count
 * does, unpublished only. Nothing at zero.
 */
@Component({
  selector: 'app-unpublished-count',
  imports: [RouterLink],
  // No box of its own: at zero it must not take a gap in the row's meta.
  host: { class: 'contents' },
  template: `
    @if (count()) {
      <a [class]="link" routerLink="/admin/products" [queryParams]="params()">{{
        label()
      }}</a>
    }
  `,
})
export class UnpublishedCount {
  private readonly common = inject(ADMIN_TEXT).common;

  readonly count = input.required<number>();
  /** The narrowing the count beside it links with. */
  readonly query = input.required<Params>();

  protected readonly link = `${LINK_BASE} ${LINK_TONES.warning}`;
  protected readonly params = computed(() => ({
    ...this.query(),
    state: 'unpublished',
  }));
  protected readonly label = computed(() =>
    fillText(this.common.unpublishedProducts, { count: this.count() }),
  );
}
