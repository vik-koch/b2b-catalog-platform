import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SyncRun,
  SyncRunStatus,
  syncRunStatusSchema,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { stableValue } from '../../core/stable-value';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { AdminGrid } from '../grid/admin-grid';
import { GridColumn } from '../grid/grid-column';
import { GridFilterOption } from '../grid/grid-filter-select';
import { GridPagination } from '../grid/grid-pagination';
import { GridCardTemplate, GridRowTemplate } from '../grid/grid-templates';
import { GridTimestamp } from '../grid/grid-timestamp';
import { AdminListHeader } from '../list-header';
import { RecordRow } from '../records/record-row';
import { SyncService } from './sync.service';

/**
 * Every catalog run, newest first (FR-ADM-09) — the screen `/admin/sync` opens
 * on.
 *
 * It used to be a five-column block under the upload form, which was enough
 * while an admin had just watched the only run there was. A run can now arrive
 * without anybody present and can be left waiting for a decision, so the log
 * is the screen and the upload is a page reached from it: the question this
 * panel answers most often is no longer "what am I about to apply" but "what
 * has been happening, and is any of it waiting for me".
 */
@Component({
  selector: 'app-sync-runs-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    AdminGrid,
    AdminIcon,
    AdminListHeader,
    Button,
    GridCardTemplate,
    GridPagination,
    GridRowTemplate,
    GridTimestamp,
    RecordRow,
    Skeleton,
    StatusBadge,
  ],
  template: `
    <app-admin-list-header
      [title]="text.title"
      [searchable]="false"
      [filtered]="filtered()"
    >
      <a appButton class="gap-2" routerLink="/admin/sync/new">
        <app-admin-icon name="upload" class="h-4 w-4" />
        {{ text.newRun }}
      </a>
    </app-admin-list-header>

    <p class="mb-6 max-w-3xl text-sm text-muted">{{ text.runsDescription }}</p>

    @if (runs.error()) {
      <p class="text-muted" role="alert">{{ text.runLoadError }}</p>
    } @else if (shown(); as data) {
      <app-admin-grid
        gridId="sync-runs"
        [columns]="columns()"
        [rows]="data.runs"
        [trackBy]="byId"
        [busy]="runs.isLoading()"
        [filtered]="filtered()"
        [emptyMessage]="text.historyEmpty"
      >
        <ng-template appGridRow [of]="data.runs" let-run>
          <!-- When it ran is what a run is called: there is no other name for
               it, and it is the way into the run itself. -->
          <td class="truncate">
            <a
              class="font-medium text-stone-700 hover:text-accent"
              [routerLink]="['/admin/sync/runs', run.id]"
            >
              <app-grid-timestamp [value]="run.startedAt" />
            </a>
          </td>
          <td class="truncate text-subtle" [title]="who(run)">
            {{ who(run) }}
          </td>
          <td class="truncate text-subtle" [title]="run.filename">
            {{ run.filename }}
          </td>
          <td data-keep>
            <ng-container
              [ngTemplateOutlet]="state"
              [ngTemplateOutletContext]="{ $implicit: run }"
            />
          </td>
          <td class="text-subtle">
            <span class="block tabular-nums">{{ changeSummary(run) }}</span>
          </td>
        </ng-template>

        <!-- The same run on a phone: when it ran and how it ended, with what
             sent it and what it came to underneath. -->
        <ng-template appGridCard [of]="data.runs" let-run>
          <app-record-row>
            <a
              class="font-medium text-stone-700 hover:text-accent"
              [routerLink]="['/admin/sync/runs', run.id]"
            >
              <app-grid-timestamp [value]="run.startedAt" />
            </a>
            <span recordBadge class="shrink-0">
              <ng-container
                [ngTemplateOutlet]="state"
                [ngTemplateOutletContext]="{ $implicit: run }"
              />
            </span>
            <p recordBody class="mt-1 truncate text-sm text-subtle">
              {{ who(run) }}
              @if (run.filename) {
                · {{ run.filename }}
              }
            </p>
            <span recordMeta class="flex min-w-0 items-baseline gap-1">
              <span class="tabular-nums">{{ changeSummary(run) }}</span>
            </span>
          </app-record-row>
        </ng-template>
      </app-admin-grid>

      <app-grid-pagination [pagination]="data.pagination" />
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }

    <!-- One badge for both shapes. A run held for review says so in its title:
         the badge has room for the word, not for the reason. -->
    <ng-template #state let-run>
      <span appStatusBadge [tone]="tone(run)" [title]="reason(run)">
        {{ statusLabel(run) }}
      </span>
    </ng-template>
  `,
})
export class SyncRunsPage {
  private readonly sync = inject(SyncService);
  protected readonly text = inject(ADMIN_TEXT).sync;
  protected readonly common = inject(ADMIN_TEXT).common;

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }

  /**
   * Bound from the query parameters. Router input binding hands an absent one
   * over as `undefined` whatever the default here says, so both are read
   * through a guard rather than used straight.
   */
  readonly page = input('1');
  readonly status = input('');

  protected readonly currentPage = computed(() => {
    const parsed = Number(this.page());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  });

  protected readonly statusFilter = computed<SyncRunStatus | undefined>(() => {
    const parsed = syncRunStatusSchema.safeParse(this.status());
    return parsed.success ? parsed.data : undefined;
  });

  protected readonly filtered = computed(() => !!this.statusFilter());

  protected readonly runs = resource({
    params: () => ({ page: this.currentPage(), status: this.statusFilter() }),
    loader: ({ params }) => this.sync.listRuns(params),
  });

  /** Held across reloads, so paging or filtering swaps the rows instead of
   * blanking the table the filter sits in. */
  protected readonly shown = stableValue(this.runs);
  protected readonly showSkeleton = delayedLoading(this.runs.isLoading);

  protected readonly columns = computed<GridColumn[]>(() => [
    { key: 'date', label: this.text.col.date, minWidth: 140 },
    { key: 'actor', label: this.text.col.actor, minWidth: 140 },
    { key: 'file', label: this.text.col.file, minWidth: 140 },
    {
      key: 'status',
      label: this.text.statusAll,
      sortName: this.text.col.status,
      minWidth: 120,
      filter: {
        param: 'status',
        options: this.statusOptions,
        value: this.statusFilter() ?? '',
        ariaLabel: this.text.filterStatus,
      },
    },
    { key: 'changes', label: this.text.col.changes, minWidth: 100 },
  ]);

  protected readonly statusOptions: GridFilterOption[] = [
    { value: '', label: this.text.statusAll },
    { value: 'previewed', label: this.text.status.previewed },
    { value: 'applied', label: this.text.status.applied },
    { value: 'failed', label: this.text.status.failed },
    { value: 'superseded', label: this.text.status.superseded },
    { value: 'discarded', label: this.text.status.discarded },
  ];

  protected readonly byId = (run: SyncRun): string => run.id;

  /**
   * Who or what ran it. A machine run has no person behind it and says so with
   * the credential's name, which is the only identity there is — and the one
   * an operator revokes if it turns out to be misbehaving.
   */
  protected who(run: SyncRun): string {
    return run.tokenName ?? run.actorEmail ?? this.text.sourceUpload;
  }

  protected statusLabel(run: SyncRun): string {
    return this.text.status[run.status];
  }

  protected reason(run: SyncRun): string {
    return run.stagedReason ? this.text.stagedReason[run.stagedReason] : '';
  }

  /** Amber where somebody has to act, green for what went through, red for
   * what broke, grey for a run that is simply over. */
  protected tone(run: SyncRun): StatusTone {
    return STATUS_TONE[run.status];
  }

  protected changeSummary(run: SyncRun): string {
    const summary = run.summary;
    if (!summary) return '';
    // Only what actually happened: a row of zeros is three figures to read
    // past before finding the one that moved.
    return [
      summary.create > 0 ? `+${summary.create}` : '',
      summary.update > 0 ? `~${summary.update}` : '',
      summary.softDelete > 0 ? `−${summary.softDelete}` : '',
      summary.errors > 0 ? `!${summary.errors}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}

const STATUS_TONE: Record<SyncRunStatus, StatusTone> = {
  previewed: 'waiting',
  applied: 'ok',
  failed: 'danger',
  superseded: 'neutral',
  discarded: 'neutral',
};
