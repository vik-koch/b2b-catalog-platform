import {
  booleanAttribute,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';

/**
 * When something happened, in an admin grid's column: the day, and under it the
 * time of day.
 *
 * One component for all three lists because they were three different answers
 * to one question — the product list showed a time, while an order's date and
 * an account's registration showed only a day. The time is what separates two
 * orders placed on the same morning, which is the case a manager on the phone
 * is actually looking at; the day above it is what the column is scanned by.
 *
 * The deployment's locale, like every other date and every price.
 */
@Component({
  selector: 'app-grid-timestamp',
  template: `
    <!-- A record on a phone reads the two as one sentence, at one size; only
         the table shrinks the time, where it is a second line under the day
         rather than a phrase beside it. -->
    @if (inline()) {
      <span class="truncate">{{ day() }}</span>
      <span class="shrink-0">{{ time() }}</span>
    } @else {
      <div>{{ day() }}</div>
      <div class="text-[0.675rem]">{{ time() }}</div>
    }
  `,
  host: { '[class]': 'inline() ? "inline-flex items-baseline gap-1" : ""' },
})
export class GridTimestamp {
  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;

  /** An ISO instant, as every API here returns one. */
  readonly value = input.required<string>();
  /** One line rather than two, for a record on a phone — where this shares a
   * line with whatever else is worth saying about the row. */
  readonly inline = input(false, { transform: booleanAttribute });

  private readonly parsed = computed(() => new Date(this.value()));
  protected readonly day = computed(() => this.dayFormat.format(this.parsed()));
  protected readonly time = computed(() =>
    this.timeFormat.format(this.parsed()),
  );

  /** Built once per component: a formatter is expensive to construct, and a
   * grid renders one of these per row. */
  private readonly dayFormat = new Intl.DateTimeFormat(this.locale, {
    dateStyle: 'medium',
  });
  private readonly timeFormat = new Intl.DateTimeFormat(this.locale, {
    timeStyle: 'medium',
  });
}
