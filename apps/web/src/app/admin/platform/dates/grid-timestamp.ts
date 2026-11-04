import {
  booleanAttribute,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { adminDayFormat } from './admin-date';

/** A grid column's moment: the day it is scanned by, and under it the time
 * that tells two orders of one morning apart. */
@Component({
  selector: 'app-grid-timestamp',
  template: `
    <!-- On a phone's record one line at one size; the table shrinks the time. -->
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
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;

  /** An ISO instant, as every API here returns one. */
  readonly value = input.required<string>();
  /** One line, for a record on a phone. */
  readonly inline = input(false, { transform: booleanAttribute });

  private readonly parsed = computed(() => new Date(this.value()));
  protected readonly day = computed(() => this.dayFormat.format(this.parsed()));
  protected readonly time = computed(() =>
    this.timeFormat.format(this.parsed()),
  );

  /** Once per component: a grid renders one per row. */
  private readonly dayFormat = adminDayFormat(this.locale);
  private readonly timeFormat = new Intl.DateTimeFormat(this.locale, {
    timeStyle: 'medium',
  });
}
