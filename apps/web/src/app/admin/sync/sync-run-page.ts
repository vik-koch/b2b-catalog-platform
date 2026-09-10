import { Component, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SyncRun } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { ConfirmService } from '../../ui/confirm.service';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { adminDayFormat } from '../grid/admin-date';
import { SyncPlanView } from './sync-plan-view';
import { SyncService } from './sync.service';

/**
 * One run: what it was, what it did or would do, and — while it is still
 * waiting — the two decisions left to make about it.
 *
 * The reason this page exists is the run nobody watched. A manual upload has
 * always shown its diff to the person who made it; a run that arrived on its
 * own and stopped short of applying itself has to be readable later, by
 * somebody who was not there, which also makes it the place a finished run's
 * record is read back.
 */
@Component({
  selector: 'app-sync-run-page',
  imports: [Button, RouterLink, Skeleton, StatusBadge, SyncPlanView],
  template: `
    @if (run.error()) {
      <p class="text-muted" role="alert">{{ text.runLoadError }}</p>
      <a appButton variant="secondary" routerLink="/admin/sync" class="mt-5">
        {{ text.backToRuns }}
      </a>
    } @else if (run.value(); as data) {
      <div>
        <!-- Title left, way back right: the same shape as every list heading,
             and the counterpart of the button that opened this page. -->
        <div class="mb-4 md:mb-6 flex flex-wrap items-center gap-3">
          <h1 class="text-3xl font-medium tracking-tight">
            {{ text.runTitle }}
          </h1>
          <span appStatusBadge [tone]="tone(data.run)">
            {{ statusLabel(data.run) }}
          </span>
          <a
            appButton
            variant="secondary"
            routerLink="/admin/sync"
            class="ml-auto"
          >
            {{ text.backToRuns }}
          </a>
        </div>
        <div class="max-w-3xl">
          <!-- The facts a person needs before reading the diff: when, who or
             what, and what it was called. -->
          <dl class="mb-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div class="flex gap-2">
              <dt class="text-subtle">{{ text.startedLabel }}</dt>
              <dd>{{ moment(data.run.startedAt) }}</dd>
            </div>
            @if (data.run.finishedAt; as finished) {
              <div class="flex gap-2">
                <dt class="text-subtle">{{ text.finishedLabel }}</dt>
                <dd>{{ moment(finished) }}</dd>
              </div>
            }
            <div class="flex gap-2">
              <dt class="text-subtle">{{ text.col.actor }}</dt>
              <dd>{{ who(data.run) }}</dd>
            </div>
            @if (data.run.filename; as label) {
              <div class="flex min-w-0 gap-2">
                <dt class="text-subtle">{{ text.col.file }}</dt>
                <dd class="truncate">{{ label }}</dd>
              </div>
            }
          </dl>

          <!-- Why it is waiting. Said in full here, where there is room for the
             sentence the log's badge only had a word for. -->
          @if (stagedReason(data.run); as reason) {
            <p
              class="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-stone-700"
            >
              {{ reason }}
            </p>
          }

          <!-- A failure the sending system reported: its own words, kept as a
             diagnostic rather than turned into wording of ours. -->
          @if (data.run.error; as failure) {
            <section
              class="mb-6 rounded-md border border-red-200 bg-red-50 p-3"
            >
              <h2 class="mb-1 text-sm font-medium text-red-800">
                {{ text.failureTitle }}
              </h2>
              <p class="break-words font-mono text-sm text-stone-700">
                {{ failure }}
              </p>
            </section>
          }

          @if (data.plan; as plan) {
            <app-sync-plan-view
              [plan]="plan"
              [applicable]="isStaged(data.run)"
              [discardable]="isStaged(data.run)"
              [busy]="busy()"
              [error]="actionError()"
              (apply)="apply(data.run.id)"
              (discardRun)="discard(data.run.id)"
            />
          } @else if (!data.run.error) {
            <p class="text-muted">{{ text.planUnavailable }}</p>
          }
        </div>
      </div>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="8" />
    }
  `,
})
export class SyncRunPage {
  private readonly sync = inject(SyncService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).sync;
  private readonly common = inject(ADMIN_TEXT).common;
  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;

  constructor() {
    usePageSeo({ name: () => this.text.runTitle });
  }

  /** The run's id, from the route. */
  readonly id = input.required<string>();

  protected readonly run = resource({
    params: () => ({ id: this.id() }),
    loader: ({ params }) => this.sync.getRun(params.id),
  });
  protected readonly showSkeleton = delayedLoading(this.run.isLoading);

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected statusLabel(run: SyncRun): string {
    return this.text.status[run.status];
  }

  protected isStaged(run: SyncRun): boolean {
    return run.status === 'previewed';
  }

  protected stagedReason(run: SyncRun): string {
    // Only while it is still waiting: on a run that ended, the status says
    // what happened and the reason it once waited is no longer the point.
    if (!this.isStaged(run) || !run.stagedReason) return '';
    return this.text.stagedReason[run.stagedReason];
  }

  protected who(run: SyncRun): string {
    return run.tokenName ?? run.actorEmail ?? this.text.sourceUpload;
  }

  protected tone(run: SyncRun): StatusTone {
    return STATUS_TONE[run.status];
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
      if (!result.ok) {
        this.actionError.set(this.text.applyErrors[result.code]);
        // The run moved under us — what it says now is the answer, not what
        // this page was showing.
        this.run.reload();
        return;
      }
      this.run.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async discard(id: string): Promise<void> {
    const ok = await this.confirm.ask({
      heading: this.text.discardTitle,
      message: this.text.discardMessage,
      confirmLabel: this.text.discardRun,
      cancelLabel: this.common.cancel,
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

const STATUS_TONE: Record<SyncRun['status'], StatusTone> = {
  previewed: 'waiting',
  applied: 'ok',
  failed: 'danger',
  // Nothing happened, and nothing was wrong with that.
  'no-change': 'neutral',
  superseded: 'neutral',
  discarded: 'neutral',
};
