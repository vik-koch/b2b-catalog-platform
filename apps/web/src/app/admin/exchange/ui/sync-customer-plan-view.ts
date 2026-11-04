import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  CustomerAccountChange,
  CustomerSyncPlan,
  CustomerSyncRowError,
} from '@b2b-catalog-platform/shared/core/exchange';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { SyncPlanActions } from './sync-plan-actions';
import { SyncPlanTiles } from './sync-plan-tiles';
import { SyncRowErrors } from './sync-row-errors';

/**
 * What a customer run would do, or did (FR-ADM-11): the counts, the accounts
 * and the skipped rows. A sibling of the catalog's view, sharing its parts
 * but none of its content.
 */
@Component({
  selector: 'app-sync-customer-plan-view',
  imports: [
    Link,
    Notice,
    RouterLink,
    StatusBadge,
    SyncPlanActions,
    SyncPlanTiles,
    SyncRowErrors,
  ],
  template: `
    <section class="rounded-md border border-edge p-4">
      <h2 class="mb-4 text-lg font-normal tracking-tight">{{ title() }}</h2>

      <app-sync-plan-tiles [tiles]="tiles()" />

      @if (isNoop()) {
        <p class="text-ink-subtle">{{ noopText() }}</p>
      }

      <app-sync-row-errors [errors]="rowErrors()" />

      @if (plan().accounts.length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium">
          {{ text.customers.accountsTitle }}
        </h3>
        <ul class="divide-y divide-edge-subtle text-sm">
          @for (account of plan().accounts; track account.sourceId) {
            <li class="flex flex-wrap items-baseline gap-x-3 py-2">
              <span uiStatusBadge [tone]="kindTone(account.kind)">
                {{ text.customers.count[kindCount[account.kind]] }}
              </span>
              <!-- The list narrowed to the address, never the account's page:
                   one this run creates has none yet. -->
              @if (account.email; as email) {
                <a
                  uiLink
                  class="font-medium"
                  routerLink="/admin/users"
                  [queryParams]="{ searchTerm: email }"
                  >{{ email }}</a
                >
              }
              @for (change of account.changes; track change.field) {
                <span class="text-ink-subtle">
                  {{ fieldLabel(change.field) }}:
                  <span class="line-through">{{ display(change.from) }}</span>
                  →
                  <span class="text-ink">{{ display(change.to) }}</span>
                </span>
              }
              @if (account.mailed) {
                <span class="text-ink-subtle">{{
                  text.customers.mailedRow
                }}</span>
              }
            </li>
          }
        </ul>
      }

      @if (plan().truncated) {
        <p class="mt-4 text-sm text-ink-subtle">{{ text.truncated }}</p>
      }

      @if (applicable()) {
        <!-- An adoption changes what a key means from now on: said before
             the press. -->
        @if (plan().summary.claimed > 0) {
          <p uiNotice tone="warning" class="mt-6" role="status">
            {{ claimWarning() }}
          </p>
        }
        @if (plan().summary.claimedById > 0) {
          <p uiNotice tone="warning" class="mt-6" role="status">
            {{ claimByIdWarning() }}
          </p>
        }

        <app-sync-plan-actions
          [gate]="plan().summary.softDelete > 0 ? disableWarning() : null"
          [noop]="isNoop()"
          [applyBlocked]="applyBlocked()"
          [discardable]="discardable()"
          [busy]="busy()"
          [error]="error()"
          (apply)="apply.emit()"
          (discardRun)="discardRun.emit()"
        />
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

  /** Still staged, so still `applicable`, but no longer appliable. */
  readonly applyBlocked = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly apply = output<void>();
  readonly discardRun = output<void>();

  protected readonly title = computed(() =>
    this.applicable() ? this.text.summaryTitle : this.text.summaryTitleApplied,
  );

  protected readonly noopText = computed(() =>
    this.applicable() ? this.text.nothingToApply : this.text.nothingChanged,
  );

  /** Mails count: a run that only resends a link still did something. */
  protected readonly isNoop = computed(() => {
    const {
      create,
      update,
      softDelete,
      restore,
      claimed,
      claimedById,
      mailed,
    } = this.plan().summary;
    return (
      create +
        update +
        softDelete +
        restore +
        claimed +
        claimedById +
        mailed ===
      0
    );
  });

  /** Some counts are an answer even at zero and hold their place; the rest
   * earn a tile by happening. */
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
      { label: 'claimed' as const, value: s.claimed, danger: false },
      { label: 'claimedById' as const, value: s.claimedById, danger: false },
      { label: 'mailed' as const, value: s.mailed, danger: false },
      { label: 'unchanged' as const, value: s.unchanged, danger: false },
      { label: 'errors' as const, value: s.errors, danger: s.errors > 0 },
    ]
      .filter((tile) => tile.value > 0 || ALWAYS_SHOWN.has(tile.label))
      .map((tile) => ({
        ...tile,
        label: this.text.customers.count[tile.label],
      }));
  });

  protected readonly rowErrors = computed(() =>
    this.plan().rowErrors.map((error) => ({
      row: error.row,
      message: this.rowErrorText(error),
    })),
  );

  /** An absent value reads as a dash, not a gap the eye skips. */
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

  protected readonly kindCount = KIND_COUNT;

  protected kindTone(kind: CustomerAccountChange['kind']): StatusTone {
    return KIND_TONE[kind];
  }

  private rowErrorText(error: CustomerSyncRowError): string {
    return fillText(
      this.text.customers.rowErrors[error.code],
      error.params ?? {},
    );
  }

  /** A notice, not the typed word, which is kept for taking something away
   * (FR-ADM-17). */
  protected claimWarning(): string {
    return fillText(this.text.customers.claimWarning, {
      count: this.plan().summary.claimed,
    });
  }

  /** The same, for an adoption the source system named outright. */
  protected claimByIdWarning(): string {
    return fillText(this.text.customers.claimByIdWarning, {
      count: this.plan().summary.claimedById,
    });
  }

  protected disableWarning(): string {
    return fillText(this.text.customers.disableWarning, {
      count: this.plan().summary.softDelete,
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

/** The tile that counts a change, whose word is the change's badge too. */
const KIND_COUNT = {
  invite: 'create',
  update: 'update',
  disable: 'softDelete',
  enable: 'restore',
  claim: 'claimed',
  'claim-id': 'claimedById',
} as const satisfies Record<CustomerAccountChange['kind'], string>;

/** Arriving settled, losing access a refusal, coming back worth pointing out. */
const KIND_TONE: Record<CustomerAccountChange['kind'], StatusTone> = {
  invite: 'ok',
  update: 'neutral',
  disable: 'danger',
  enable: 'info',
  // From here that key means this person; the next run does not undo it.
  claim: 'waiting',
  'claim-id': 'waiting',
};
