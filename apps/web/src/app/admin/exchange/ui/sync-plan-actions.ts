import { ADMIN_EXCHANGE_TEXT } from '../exchange-text';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';

/**
 * The decisions on a staged run: apply, behind a typed word where it takes
 * something away, and discard where the caller offers it.
 */
@Component({
  selector: 'app-sync-plan-actions',
  imports: [Button, ErrorText, Input, Notice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (gate() && !applyBlocked()) {
      <div uiNotice tone="danger" class="mt-6">
        <p>{{ gate() }}</p>
        <label class="mt-2 block text-sm">
          <span class="mb-1 block">{{ confirmLabel }}</span>
          <input
            type="text"
            uiInput
            class="font-mono"
            [value]="confirmation()"
            (input)="confirmation.set($any($event.target).value)"
          />
        </label>
      </div>
    }

    @if (applyOffered() || discardable()) {
      <div class="mt-6 flex flex-wrap items-center gap-3">
        @if (applyOffered()) {
          <button
            uiButton
            type="button"
            [disabled]="!canApply() || busy()"
            (click)="apply.emit()"
          >
            {{ busy() ? text.applying : text.apply }}
          </button>
        }
        @if (discardable()) {
          <button
            uiButton
            variant="dangerOutline"
            type="button"
            [disabled]="busy()"
            (click)="discardRun.emit()"
          >
            {{ text.discardRun }}
          </button>
        }
      </div>
    }

    @if (error(); as message) {
      <p uiErrorText class="mt-3" role="alert">{{ message }}</p>
    }
  `,
})
export class SyncPlanActions {
  protected readonly text = inject(ADMIN_EXCHANGE_TEXT).sync;

  /** The warning of a run that takes something away, which then needs the
   * word typed; null where it takes nothing. */
  readonly gate = input<string | null>(null);
  /** A run with nothing to apply offers no apply. */
  readonly noop = input(false);
  /** Still staged but no longer appliable (FR-ADM-10); discarding stays. */
  readonly applyBlocked = input(false);
  readonly discardable = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly apply = output<void>();
  readonly discardRun = output<void>();

  protected readonly confirmation = signal('');
  protected readonly confirmLabel = fillText(this.text.deleteConfirmLabel, {
    word: this.text.deleteConfirmWord,
  });

  protected readonly applyOffered = computed(
    () => !this.noop() && !this.applyBlocked(),
  );

  protected readonly canApply = computed(
    () =>
      !this.gate() ||
      this.confirmation().trim() === this.text.deleteConfirmWord,
  );
}
