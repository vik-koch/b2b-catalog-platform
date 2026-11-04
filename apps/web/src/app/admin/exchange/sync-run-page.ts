import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CustomerSyncPlan,
  isCustomerSyncPlan,
  isOrderSyncPlan,
  CatalogSyncPlan,
  OrderSyncPlan,
  SyncRun,
} from '@b2b-catalog-platform/shared/core/exchange';
import { AuthService } from '../../shared/auth/auth.service';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { adminDayFormat } from '../dates/admin-date';
import { SyncCustomerPlanView } from './ui/sync-customer-plan-view';
import { SyncOrderPlanView } from './ui/sync-order-plan-view';
import { SyncCatalogPlanView } from './ui/sync-catalog-plan-view';
import { LockedNote } from '../platform/ownership/ui/locked-note';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { SYNC_RUN_TONE, syncRunActor } from './sync-run-format';
import { SyncService } from './sync.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';

/** Whatever diff this run holds, or none: pruned, or never taken. */
type AreaPlan = CatalogSyncPlan | CustomerSyncPlan | OrderSyncPlan | null;

/**
 * One run: what it was, what it did or would do, and while it waits the two
 * decisions left. Above all for the run nobody watched arrive.
 */
@Component({
  selector: 'app-sync-run-page',
  imports: [
    Notice,
    Button,
    LockedNote,
    RouterLink,
    Skeleton,
    StatusBadge,
    SyncCustomerPlanView,
    SyncOrderPlanView,
    SyncCatalogPlanView,
    PageTitle,
  ],
  template: `
    @if (run.error()) {
      <p class="text-ink-subtle" role="alert">{{ text.runLoadError }}</p>
      <a uiButton variant="secondary" [routerLink]="fallbackLog()" class="mt-5">
        {{ text.backToRuns }}
      </a>
    } @else if (run.value(); as data) {
      <div>
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <h1 uiPageTitle>
            {{ text.runTitle }}
          </h1>
          <span uiStatusBadge [tone]="tone(data.run)">
            {{ statusLabel(data.run) }}
          </span>
          <a
            uiButton
            variant="secondary"
            [routerLink]="['/admin/sync', data.run.area]"
            class="ml-auto"
          >
            {{ text.backToRuns }}
          </a>
        </div>
        <div class="max-w-3xl">
          <dl class="mb-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div class="flex gap-2">
              <dt class="text-ink-subtle">{{ text.startedLabel }}</dt>
              <dd>{{ moment(data.run.startedAt) }}</dd>
            </div>
            @if (data.run.finishedAt; as finished) {
              <div class="flex gap-2">
                <dt class="text-ink-subtle">{{ text.finishedLabel }}</dt>
                <dd>{{ moment(finished) }}</dd>
              </div>
            }
            <div class="flex gap-2">
              <dt class="text-ink-subtle">{{ text.col.actor }}</dt>
              <dd>{{ who(data.run) }}</dd>
            </div>
            @if (data.run.filename; as label) {
              <div class="flex min-w-0 gap-2">
                <dt class="text-ink-subtle">{{ text.col.file }}</dt>
                <dd class="truncate">{{ label }}</dd>
              </div>
            }
          </dl>

          @if (stagedReason(data.run); as reason) {
            <p uiNotice tone="warning" class="mb-6">
              {{ reason }}
            </p>
          }

          <!-- The sender's own note on a run that worked anyway, on any
               status. -->
          @if (data.run.notice; as note) {
            <section uiNotice tone="info" class="mb-6">
              <h2 class="mb-1 font-medium">
                {{ text.noticeTitle }}
              </h2>
              <p class="wrap-break-word font-mono text-sm text-ink">
                {{ note }}
              </p>
            </section>
          }

          <!-- The sender's own words, kept as a diagnostic. -->
          @if (data.run.error; as failure) {
            <section uiNotice tone="danger" class="mb-6">
              <h2 class="mb-1 font-medium">
                {{ text.failureTitle }}
              </h2>
              <p class="wrap-break-word font-mono text-sm text-ink">
                {{ failure }}
              </p>
            </section>
          }

          @if (strandedByOwnership(data.run)) {
            <app-locked-note class="mb-4">
              {{ ownershipText.runStranded }}
            </app-locked-note>
          }

          @if (customerPlan(data.plan); as plan) {
            <app-sync-customer-plan-view
              [plan]="plan"
              [applicable]="isStaged(data.run)"
              [applyBlocked]="strandedByOwnership(data.run)"
              [discardable]="isStaged(data.run)"
              [busy]="busy()"
              [error]="actionError()"
              (apply)="apply(data.run.id)"
              (discardRun)="discard(data.run.id)"
            />
          } @else if (orderPlan(data.plan); as plan) {
            <!-- An order run is applied as it arrives: always a record. -->
            <app-sync-order-plan-view [plan]="plan" />
          } @else if (catalogPlan(data.plan); as plan) {
            <app-sync-catalog-plan-view
              [plan]="plan"
              [applicable]="isStaged(data.run)"
              [applyBlocked]="strandedByOwnership(data.run)"
              [discardable]="isStaged(data.run)"
              [busy]="busy()"
              [error]="actionError()"
              (apply)="apply(data.run.id)"
              (discardRun)="discard(data.run.id)"
            />
          } @else if (!data.run.error) {
            <p class="text-ink-subtle">{{ text.planUnavailable }}</p>
          }
        </div>
      </div>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="8" />
    }
  `,
})
export class SyncRunPage {
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  private readonly confirm = inject(ConfirmService);
  private readonly ownership = inject(OwnershipService);
  protected readonly text = inject(ADMIN_TEXT).sync;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;

  constructor() {
    usePageSeo({ name: () => this.text.runTitle });
    // Admins only: the read is theirs and fails closed, so a manager would
    // believe every area owned.
    if (this.auth.user()?.role === 'admin') void this.ownership.load();
  }

  readonly id = input.required<string>();

  /** "Back" for a run that could not be read: a log this reader has. */
  protected readonly fallbackLog = computed(() =>
    this.auth.user()?.role === 'manager'
      ? '/admin/sync/customers'
      : '/admin/sync/catalog',
  );

  protected readonly run = resource({
    params: () => ({ id: this.id() }),
    loader: ({ params }) => this.sync.getRun(params.id),
  });
  protected readonly showSkeleton = delayedLoading(this.run.isLoading);

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected customerPlan(plan: AreaPlan): CustomerSyncPlan | null {
    return plan && isCustomerSyncPlan(plan) ? plan : null;
  }

  protected orderPlan(plan: AreaPlan): OrderSyncPlan | null {
    return plan && isOrderSyncPlan(plan) ? plan : null;
  }

  /** The plan that is neither of the other two. */
  protected catalogPlan(plan: AreaPlan): CatalogSyncPlan | null {
    return plan && !isCustomerSyncPlan(plan) && !isOrderSyncPlan(plan)
      ? plan
      : null;
  }

  protected statusLabel(run: SyncRun): string {
    return this.text.status[run.status];
  }

  protected isStaged(run: SyncRun): boolean {
    return run.status === 'previewed';
  }

  /**
   * An uploaded run whose area has since been handed over (FR-ADM-10): the
   * API would refuse the apply. A machine run stays appliable, since it only
   * exists while the area is owned, and discarding stays for both. Asked for
   * an admin only; a manager meets the API's worded refusal.
   */
  protected strandedByOwnership(run: SyncRun): boolean {
    return (
      this.isStaged(run) &&
      run.source === 'upload' &&
      this.auth.user()?.role === 'admin' &&
      this.ownership.owns(run.area)
    );
  }

  protected stagedReason(run: SyncRun): string {
    // Only while it waits: on a finished run the status says what happened.
    if (!this.isStaged(run) || !run.stagedReason) return '';
    return this.text.stagedReason[run.stagedReason];
  }

  protected who(run: SyncRun): string {
    return syncRunActor(run, this.text);
  }

  protected tone(run: SyncRun): StatusTone {
    return SYNC_RUN_TONE[run.status];
  }

  protected moment(iso: string): string {
    const at = new Date(iso);
    return `${this.dayFormat.format(at)} ${this.timeFormat.format(at)}`;
  }

  private readonly dayFormat = adminDayFormat(this.locale);
  private readonly timeFormat = new Intl.DateTimeFormat(this.locale, {
    timeStyle: 'short',
  });

  protected async apply(id: string): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const result = await this.sync.commit(id);
      if (!result.ok) this.actionError.set(this.text.applyErrors[result.code]);
      // Refused or not, what the run says now is the answer.
      this.run.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async discard(id: string): Promise<void> {
    const ok = await this.confirm.ask({
      heading: this.text.discardConfirm.heading,
      message: this.text.discardConfirm.message,
      confirmLabel: this.text.discardConfirm.confirm,
      cancelLabel: this.text.discardConfirm.cancel ?? this.actionText.cancel,
      confirmVariant: 'danger',
    });
    if (!ok) return;

    this.busy.set(true);
    this.actionError.set(null);
    try {
      const result = await this.sync.discard(id);
      if (!result.ok) this.actionError.set(this.text.applyErrors[result.code]);
      this.run.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
