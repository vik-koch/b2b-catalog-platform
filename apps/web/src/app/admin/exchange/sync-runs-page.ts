import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import {
  CATALOG_SYNC_CSV_COLUMNS,
  SyncArea,
  SyncRun,
  SyncRunStatus,
  syncRunStatusSchema,
} from '@b2b-catalog-platform/shared/core/exchange';
import { AuthService } from '../../platform/auth/auth.service';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { delayedLoading } from '../../platform/delayed-loading';
import { usePageSeo } from '../../platform/page-seo';
import { stableValue } from '../../platform/stable-value';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { DataGrid } from '@b2b-catalog-platform/ui/grid/data-grid';
import { GridColumn } from '@b2b-catalog-platform/ui/grid/grid-column';
import { GridFilterOption } from '@b2b-catalog-platform/ui/grid/grid-filter-select';
import { GridPagination } from '@b2b-catalog-platform/ui/grid/grid-pagination';
import { GridCardTemplate } from '@b2b-catalog-platform/ui/grid/grid-card-template';
import { GridRowTemplate } from '@b2b-catalog-platform/ui/grid/grid-row-template';
import { GridTimestamp } from '../dates/grid-timestamp';
import { GridHeader } from '@b2b-catalog-platform/ui/grid/grid-header';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import {
  SYNC_RUN_TONE,
  syncChangeSummary,
  syncRunActor,
} from './sync-run-format';
import { SyncService } from './sync.service';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { uploadIcon } from '@b2b-catalog-platform/ui/icons/glyphs/upload';

/**
 * One area's runs, newest first (FR-ADM-09), at `/admin/sync/<area>`. One
 * screen per area rather than an area filter: who may read a run depends on
 * its area, so a mixed log would open on rows half its readers are refused.
 */
@Component({
  selector: 'app-sync-runs-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    DataGrid,
    Icon,
    GridHeader,
    Button,
    GridCardTemplate,
    GridPagination,
    GridRowTemplate,
    GridTimestamp,
    RecordRow,
    Skeleton,
    StatusBadge,
    PageIntro,
  ],
  template: `
    <ui-grid-header
      [title]="areaText().title"
      [searchable]="false"
      [filtered]="filtered()"
    >
      <!-- Kept while the area is owned: the upload page says why it is
           closed, which a missing button would not. -->
      @if (canUpload()) {
        <a uiButton class="gap-2" [routerLink]="uploadLink()">
          <ui-icon [glyph]="uploadIcon" class="size-4" />
          {{ text.newRun }}
        </a>
      }
    </ui-grid-header>

    <p uiPageIntro class="mb-6 max-w-3xl">
      {{ areaText().runsDescription }}
    </p>

    @if (runs.error()) {
      <p class="text-ink-subtle" role="alert">{{ text.runLoadError }}</p>
    } @else if (shown(); as data) {
      <ui-data-grid
        gridId="sync-runs"
        [columns]="columns()"
        [rows]="data.runs"
        [trackBy]="byId"
        [busy]="runs.isLoading()"
        [filtered]="filtered()"
        [emptyMessage]="text.historyEmpty"
        [total]="data.pagination.total"
        [countLabel]="text.historyCount"
      >
        <ng-template uiGridRow [of]="data.runs" let-run>
          <!-- When it ran is the run's only name, and the way into it. -->
          <td class="truncate">
            <a
              class="font-medium text-ink hover:text-accent"
              [routerLink]="['/admin/sync/runs', run.id]"
            >
              <app-grid-timestamp [value]="run.startedAt" />
            </a>
          </td>
          <td class="truncate text-ink-subtle" [title]="who(run)">
            {{ who(run) }}
          </td>
          <td class="truncate text-ink-subtle" [title]="run.filename">
            {{ run.filename }}
          </td>
          <td data-keep>
            <ng-container
              [ngTemplateOutlet]="state"
              [ngTemplateOutletContext]="{ $implicit: run }"
            />
          </td>
          <td class="text-ink-subtle">
            <span class="block tabular-nums">{{ changeSummary(run) }}</span>
            <span class="block truncate text-xs" [title]="fieldsTitle(run)">{{
              fieldsLine(run)
            }}</span>
          </td>
        </ng-template>

        <ng-template uiGridCard [of]="data.runs" let-run>
          <ui-record-row>
            <a
              class="font-medium text-ink hover:text-accent"
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
            <p recordBody class="mt-1 truncate text-sm text-ink-subtle">
              {{ who(run) }}
              @if (run.filename) {
                · {{ run.filename }}
              }
            </p>
            <span recordMeta class="flex min-w-0 items-baseline gap-1">
              <span class="tabular-nums">{{ changeSummary(run) }}</span>
              <span class="truncate">{{ fieldsLine(run) }}</span>
            </span>
          </ui-record-row>
        </ng-template>
      </ui-data-grid>

      <ui-grid-pagination [pagination]="data.pagination" />
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }

    <!-- A held run's reason goes in the title: the badge has room for a word. -->
    <ng-template #state let-run>
      <span uiStatusBadge [tone]="tone(run)" [title]="reason(run)">
        {{ statusLabel(run) }}
      </span>
    </ng-template>
  `,
})
export class SyncRunsPage {
  protected readonly uploadIcon = uploadIcon;
  private readonly sync = inject(SyncService);
  protected readonly text = inject(ADMIN_TEXT).sync;
  private readonly auth = inject(AuthService);

  /** Uploads are an admin's, so a manager gets no button to a guarded route. */
  protected readonly canUpload = computed(
    () => this.auth.user()?.role === 'admin' && this.uploadLink() !== null,
  );

  /** This area's upload, or null: orders are answered, never uploaded. */
  protected readonly uploadLink = computed(() => {
    switch (this.area()) {
      case 'customers':
        return '/admin/sync/customers/new';
      case 'catalog':
        return '/admin/sync/catalog/new';
      case 'orders':
        return null;
    }
  });

  constructor() {
    usePageSeo({ name: () => this.areaText().title });
  }

  /** From the route's data, which its guard is chosen to match. */
  readonly area = input.required<SyncArea>();

  protected readonly areaText = computed(() => this.text.areas[this.area()]);

  /** Router input binding hands an absent param over as `undefined`
   * whatever the default says, so both are read through a guard. */
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
    params: () => ({
      area: this.area(),
      page: this.currentPage(),
      status: this.statusFilter(),
    }),
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
        label: this.text.filterStatus,
      },
    },
    { key: 'changes', label: this.text.col.changes, minWidth: 100 },
  ]);

  protected readonly statusOptions: GridFilterOption[] = [
    { value: '', label: this.text.statusAll },
    { value: 'previewed', label: this.text.status.previewed },
    { value: 'applied', label: this.text.status.applied },
    { value: 'failed', label: this.text.status.failed },
    { value: 'no-change', label: this.text.status['no-change'] },
    { value: 'superseded', label: this.text.status.superseded },
    { value: 'discarded', label: this.text.status.discarded },
  ];

  protected readonly byId = (run: SyncRun): string => run.id;

  protected who(run: SyncRun): string {
    return syncRunActor(run, this.text);
  }

  /** Which fields it wrote: for a frequent feed, the question asked of the
   * log. */
  protected fieldsLine(run: SyncRun): string {
    const fields = run.summary?.fields ?? [];
    const shown = fields.slice(0, FIELDS_SHOWN).map((f) => this.fieldLabel(f));
    if (fields.length > FIELDS_SHOWN) {
      shown.push(
        fillText(this.text.moreFields, { count: fields.length - FIELDS_SHOWN }),
      );
    }
    return shown.join(' · ');
  }

  /** The whole list, for the ones the column had no room for. */
  protected fieldsTitle(run: SyncRun): string {
    return (run.summary?.fields ?? [])
      .map((field) => this.fieldLabel(field))
      .join(' · ');
  }

  /** An unknown field reads as itself rather than as nothing. */
  private fieldLabel(field: string): string {
    switch (this.area()) {
      case 'customers':
        return this.wordOf(this.text.customers.field, field);
      case 'orders':
        return this.wordOf(this.text.orders.field, field);
      case 'catalog':
        return this.catalogFieldLabel(field);
    }
  }

  private wordOf(words: Readonly<Record<string, string>>, field: string) {
    return words[field] ?? field;
  }

  private catalogFieldLabel(field: string): string {
    // A price column names its list, as the file did.
    if (field.startsWith(CATALOG_SYNC_CSV_COLUMNS.pricePrefix)) {
      return fillText(this.text.field.priceList, {
        key: field.slice(CATALOG_SYNC_CSV_COLUMNS.pricePrefix.length),
      });
    }
    return this.wordOf(this.text.field, field);
  }

  protected statusLabel(run: SyncRun): string {
    return this.text.status[run.status];
  }

  protected reason(run: SyncRun): string {
    return run.stagedReason ? this.text.stagedReason[run.stagedReason] : '';
  }

  protected tone(run: SyncRun): StatusTone {
    return SYNC_RUN_TONE[run.status];
  }

  protected changeSummary(run: SyncRun): string {
    return syncChangeSummary(run.summary);
  }
}

/** How many field names the column shows before it starts counting them. */
const FIELDS_SHOWN = 3;
