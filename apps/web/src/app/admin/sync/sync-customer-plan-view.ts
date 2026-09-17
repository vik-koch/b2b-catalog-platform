import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CustomerAccountChange,
  CustomerSyncPlan,
  CustomerSyncRowError,
  fillText,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Link } from '../../ui/link';
import { StatusBadge, StatusTone } from '../../ui/status-badge';

/**
 * What a customer run would do, or did (FR-ADM-11): the counts, the accounts,
 * and the rows that could not be used.
 *
 * A sibling of `SyncPlanView` rather than a branch inside it. The two share
 * their shape — tiles, a list, the skipped rows, and for a staged run the gate
 * and the two buttons — and share none of their content: one lists products
 * with prices to format, the other lists people, and every sentence on it is a
 * different sentence. A single component would have been two templates behind
 * an `@if` with a union it had to narrow on every line.
 */
@Component({
  selector: 'app-sync-customer-plan-view',
  imports: [Button, Input, Link, RouterLink, StatusBadge],
  template: `
    <section class="rounded-md border border-border p-4">
      <h2 class="mb-4 text-lg font-normal tracking-tight">{{ title() }}</h2>

      <dl class="mb-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        @for (tile of tiles(); track tile.label) {
          <div>
            <dt class="text-subtle">{{ text.customers.count[tile.label] }}</dt>
            <dd class="text-lg font-medium" [class.text-red-700]="tile.danger">
              {{ tile.value }}
            </dd>
          </div>
        }
      </dl>

      @if (isNoop()) {
        <p class="text-muted">{{ noopText() }}</p>
      }

      @if (plan().rowErrors.length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium text-red-700">
          {{ text.errorsTitle }}
        </h3>
        <ul class="space-y-1 text-sm text-stone-700">
          @for (error of plan().rowErrors; track $index) {
            <li>
              <span class="text-subtle">{{ rowLabel(error.row) }}</span>
              — {{ rowErrorText(error) }}
            </li>
          }
        </ul>
      }

      @if (plan().accounts.length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium">
          {{ text.customers.accountsTitle }}
        </h3>
        <ul class="divide-y divide-stone-100 text-sm">
          @for (account of plan().accounts; track account.sourceId) {
            <li class="flex flex-wrap items-baseline gap-x-3 py-2">
              <span appStatusBadge [tone]="kindTone(account.kind)">
                {{ text.customers.kind[account.kind] }}
              </span>
              <!-- Always the account list narrowed to this address, never the
                   account's own page: one this run creates has no page at the
                   time the diff is taken, and one destination that is always
                   right beats two that differ by row. -->
              @if (account.email; as email) {
                <a
                  appLink
                  class="font-medium"
                  routerLink="/admin/users"
                  [queryParams]="{ searchTerm: email }"
                  >{{ email }}</a
                >
              }
              @for (change of account.changes; track change.field) {
                <span class="text-subtle">
                  {{ fieldLabel(change.field) }}:
                  <span class="line-through">{{ display(change.from) }}</span>
                  →
                  <span class="text-stone-700">{{ display(change.to) }}</span>
                </span>
              }
              @if (account.mailed) {
                <span class="text-subtle">{{ text.customers.mailedRow }}</span>
              }
            </li>
          }
        </ul>
      }

      @if (plan().truncated) {
        <p class="mt-4 text-sm text-subtle">{{ text.truncated }}</p>
      }

      @if (applicable()) {
        <!-- The gate before a run that takes people's access away: the same
             typed confirmation a sweep of the catalog asks for, because it is
             the same class of act. -->
        @if (plan().summary.softDelete > 0) {
          <div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3">
            <p class="text-sm text-red-800">{{ disableWarning() }}</p>
            <label class="mt-2 block text-sm">
              <span class="mb-1 block">{{ confirmLabel() }}</span>
              <input
                type="text"
                appInput
                class="font-mono"
                [value]="confirmation()"
                (input)="confirmation.set($any($event.target).value)"
              />
            </label>
          </div>
        }

        @if (!isNoop() || discardable()) {
          <div class="mt-6 flex flex-wrap items-center gap-3">
            @if (!isNoop()) {
              <button
                appButton
                type="button"
                [disabled]="!canApply() || busy()"
                (click)="apply.emit()"
              >
                {{ busy() ? text.applying : text.apply }}
              </button>
            }
            @if (discardable()) {
              <button
                appButton
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
          <p class="mt-3 text-sm text-red-700" role="alert">{{ message }}</p>
        }
      }
    </section>
  `,
})
export class SyncCustomerPlanView {
  protected readonly text = inject(ADMIN_TEXT).sync;

  readonly plan = input.required<CustomerSyncPlan>();
  /** A staged run, which can still be acted on. False for a record. */
  readonly applicable = input(false);
  readonly discardable = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly apply = output<void>();
  readonly discardRun = output<void>();

  protected readonly confirmation = signal('');

  protected readonly title = computed(() =>
    this.applicable() ? this.text.summaryTitle : this.text.summaryTitleApplied,
  );

  protected readonly noopText = computed(() =>
    this.applicable() ? this.text.nothingToApply : this.text.nothingChanged,
  );

  /**
   * A run with nothing in it. The mails count: a run that moved no account but
   * sent somebody the link they rang the shop about is not one that did
   * nothing, and the button has to stay live for it.
   */
  protected readonly isNoop = computed(() => {
    const { create, update, softDelete, restore, mailed } = this.plan().summary;
    return create + update + softDelete + restore + mailed === 0;
  });

  /**
   * Four counts are an answer even at zero — nobody invited, nothing changed,
   * nobody switched off, nothing skipped — and hold their place so the row does
   * not rearrange itself between runs. The rest earn a tile by happening.
   */
  protected readonly tiles = computed(() => {
    const s = this.plan().summary;
    return [
      { label: 'create' as const, value: s.create, danger: false },
      { label: 'update' as const, value: s.update, danger: false },
      {
        label: 'softDelete' as const,
        value: s.softDelete,
        danger: s.softDelete > 0,
      },
      { label: 'restore' as const, value: s.restore, danger: false },
      { label: 'mailed' as const, value: s.mailed, danger: false },
      { label: 'unchanged' as const, value: s.unchanged, danger: false },
      { label: 'errors' as const, value: s.errors, danger: s.errors > 0 },
    ].filter((tile) => tile.value > 0 || ALWAYS_SHOWN.has(tile.label));
  });

  /** A run that takes access away needs the confirmation word typed exactly. */
  protected readonly canApply = computed(
    () =>
      this.plan().summary.softDelete === 0 ||
      this.confirmation().trim() === this.text.deleteConfirmWord,
  );

  /** An absent value — no company, the base price list — reads as a dash
   * rather than as an empty gap the eye skips. */
  protected display(value: string | null): string {
    return value ?? '—';
  }

  protected fieldLabel(field: string): string {
    return (
      this.text.customers.field[
        field as keyof typeof this.text.customers.field
      ] ?? field
    );
  }

  protected kindTone(kind: CustomerAccountChange['kind']): StatusTone {
    return KIND_TONE[kind];
  }

  protected rowErrorText(error: CustomerSyncRowError): string {
    return fillText(
      this.text.customers.rowErrors[error.code],
      error.params ?? {},
    );
  }

  protected rowLabel(row: number): string {
    return fillText(this.text.errorRow, { row });
  }

  protected disableWarning(): string {
    return fillText(this.text.customers.disableWarning, {
      count: this.plan().summary.softDelete,
    });
  }

  protected confirmLabel(): string {
    return fillText(this.text.deleteConfirmLabel, {
      word: this.text.deleteConfirmWord,
    });
  }
}

/** The counts that are an answer even at zero. */
const ALWAYS_SHOWN: ReadonlySet<string> = new Set([
  'create',
  'update',
  'softDelete',
  'errors',
]);

/** What the run would do to somebody, in the app's own tones: an account
 * arriving is settled, one losing access is a refusal, one coming back is worth
 * pointing out, and a plain edit is neither. */
const KIND_TONE: Record<CustomerAccountChange['kind'], StatusTone> = {
  invite: 'ok',
  update: 'neutral',
  disable: 'danger',
  enable: 'info',
};
