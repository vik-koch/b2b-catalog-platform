import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';

export interface SyncRowErrorLine {
  row: number;
  message: string;
}

/** The rows a run skipped, each with the area's sentence for why. */
@Component({
  selector: 'app-sync-row-errors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (errors().length > 0) {
      <h3 class="mt-6 mb-2 text-sm font-medium text-danger">
        {{ text.errorsTitle }}
      </h3>
      <ul class="space-y-1 text-sm text-ink">
        @for (error of errors(); track $index) {
          <li>
            <span class="text-ink-subtle">{{ rowLabel(error.row) }}</span>
            — {{ error.message }}
          </li>
        }
      </ul>
    }
  `,
})
export class SyncRowErrors {
  protected readonly text = inject(ADMIN_TEXT).sync;

  readonly errors = input.required<readonly SyncRowErrorLine[]>();

  protected rowLabel(row: number): string {
    return fillText(this.text.errorRow, { row });
  }
}
