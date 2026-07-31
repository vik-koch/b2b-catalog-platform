import { Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SYNC_ALL_FIELDS,
  SyncOptions,
  SyncPlan,
  SyncPreviewResponse,
  SyncProductChange,
  SyncRun,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { ADMIN_TEXT } from '../config/admin-text';
import { AdminText } from '../config/admin-text.type';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { formatPriceMinor } from '../catalog/price';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { SyncService } from './sync.service';
import { SYNC_PRESETS, SyncPresetName, presetFor } from './sync-presets';

/**
 * Bulk catalog sync (FR-ADM-02) at `/admin/sync`: pick what the file is, upload
 * it, read the diff, apply it.
 *
 * The screen is built around the fact that the destructive option is the whole
 * risk. So the run's intent is chosen as a *preset* first (the raw flags stay
 * available but folded away), hiding products is only offered for a file
 * declared complete, and applying a run that hides anything needs a typed
 * confirmation. Nothing is written before Apply — the preview is a dry run the
 * server stages and the commit re-checks.
 */
@Component({
  selector: 'app-sync-page',
  imports: [RouterLink, Button, LucideIcon, FieldLabel, Input],
  template: `
    <h1 class="mb-2 text-3xl font-bold tracking-tight">{{ text.title }}</h1>
    <p class="mb-8 max-w-2xl text-muted">{{ text.description }}</p>

    <!-- Step 1: what is this file? -->
    <section class="mb-8">
      <h2 class="mb-3 text-sm font-medium">{{ text.modeLabel }}</h2>
      <div class="space-y-2">
        @for (option of presets; track option.name) {
          <label
            class="flex cursor-pointer gap-3 rounded-md border p-3"
            [class.border-primary]="preset() === option.name"
            [class.border-border]="preset() !== option.name"
          >
            <input
              type="radio"
              name="preset"
              class="mt-1"
              [checked]="preset() === option.name"
              (change)="selectPreset(option.name)"
            />
            <span>
              <span class="block text-sm font-medium">{{
                text.mode[option.label]
              }}</span>
              @if (option.hint) {
                <span class="block text-sm text-subtle">{{
                  text.mode[option.hint]
                }}</span>
              }
            </span>
          </label>
        }
      </div>

      <details class="mt-4">
        <summary class="cursor-pointer text-sm text-muted">
          {{ text.advanced }}
        </summary>
        <div class="mt-3 space-y-2 border-l-2 border-stone-100 pl-4">
          @for (flag of flags; track flag.key) {
            <label class="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                class="mt-1"
                [checked]="isFlagOn(flag.key)"
                [disabled]="
                  flag.key === 'softDelete' &&
                  !options().productSetAuthoritative
                "
                (change)="toggleFlag(flag.key, $any($event.target).checked)"
              />
              <span>
                {{ text.option[flag.label] }}
                @if (flag.hint) {
                  <span class="block text-subtle">{{
                    text.option[flag.hint]
                  }}</span>
                }
              </span>
            </label>
          }
        </div>
      </details>
    </section>

    <!-- Step 2: the file -->
    <section class="mb-8">
      <span appFieldLabel>{{ text.file }}</span>

      <!-- The picker is the drop target: a bare file input is easy to miss on
           a screen where uploading is the whole point. -->
      <input
        #fileInput
        type="file"
        accept=".csv,text/csv"
        class="sr-only"
        (change)="onFile($event)"
      />
      <button
        type="button"
        class="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors"
        [class]="dropZoneClass()"
        (click)="openPicker(fileInput)"
        (dragover)="onDragOver($event)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
      >
        <app-lucide-icon name="upload" class="h-6 w-6 text-stone-400" />
        @if (file(); as chosen) {
          <span class="font-medium">{{ chosen.name }}</span>
          <span class="text-sm text-subtle">{{ text.changeFile }}</span>
        } @else {
          <span class="font-medium">{{ text.dropHint }}</span>
          <span class="text-sm text-primary underline">{{ text.browse }}</span>
        }
      </button>
      <p class="mt-1 text-sm text-subtle">{{ text.fileHint }}</p>

      <div class="mt-4 flex items-center gap-3">
        <button
          appButton
          type="button"
          [disabled]="!file() || previewing()"
          (click)="runPreview()"
        >
          {{ previewing() ? text.previewing : text.preview }}
        </button>
        @if (previewed()) {
          <button appButton variant="secondary" type="button" (click)="reset()">
            {{ text.discard }}
          </button>
        }
      </div>

      @if (previewError(); as message) {
        <p class="mt-3 text-sm text-red-700" role="alert">
          {{ text.previewError }} {{ message }}
        </p>
      }
    </section>

    <!-- Step 3: the diff -->
    @if (previewed(); as response) {
      @let plan = response.plan;
      <section class="mb-8 rounded-md border border-border p-4">
        <h2 class="mb-4 text-lg font-semibold">{{ text.summaryTitle }}</h2>

        <dl class="mb-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          @for (tile of summaryTiles(plan); track tile.label) {
            <div>
              <dt class="text-subtle">{{ text.count[tile.label] }}</dt>
              <dd
                class="text-lg font-semibold"
                [class.text-red-700]="tile.danger"
              >
                {{ tile.value }}
              </dd>
            </div>
          }
        </dl>

        @if (isNoop(plan)) {
          <p class="text-muted">{{ text.nothingToApply }}</p>
        }

        @if (plan.rowErrors.length > 0) {
          <h3 class="mt-6 mb-2 text-sm font-semibold text-red-700">
            {{ text.errorsTitle }}
          </h3>
          <ul class="space-y-1 text-sm text-stone-700">
            @for (error of plan.rowErrors; track $index) {
              <li>
                <span class="text-subtle">{{ rowLabel(error.row) }}</span>
                — {{ error.message }}
              </li>
            }
          </ul>
        }

        @if (plan.categories.length > 0) {
          <h3 class="mt-6 mb-1 text-sm font-semibold">
            {{ text.categoriesTitle }}
          </h3>
          <p class="mb-2 text-sm text-subtle">{{ text.categoriesHint }}</p>
          <ul class="space-y-1 text-sm">
            @for (category of plan.categories; track category.name) {
              <li>
                {{ category.name }}
                <span class="text-subtle">({{ category.productCount }})</span>
              </li>
            }
          </ul>
        }

        @if (plan.products.length > 0) {
          <h3 class="mt-6 mb-2 text-sm font-semibold">
            {{ text.productsTitle }}
          </h3>
          <ul class="divide-y divide-stone-100 text-sm">
            @for (product of plan.products; track product.sourceId) {
              <li class="flex flex-wrap items-baseline gap-x-3 py-2">
                <span
                  class="rounded px-1.5 py-0.5 text-xs"
                  [class]="badgeClass(product.kind)"
                >
                  {{ text.kind[product.kind] }}
                </span>
                <span class="font-medium">{{ product.name }}</span>
                @for (change of product.changes; track change.field) {
                  <span class="text-subtle">
                    {{ change.field }}:
                    <span class="line-through">{{
                      display(change.field, change.from)
                    }}</span>
                    →
                    <span class="text-stone-700">{{
                      display(change.field, change.to)
                    }}</span>
                  </span>
                }
              </li>
            }
          </ul>
        }

        @if (plan.emptiedCategories.length > 0) {
          <h3 class="mt-6 mb-1 text-sm font-semibold">
            {{ text.emptiedTitle }}
          </h3>
          <p class="mb-2 text-sm text-subtle">{{ text.emptiedHint }}</p>
          <ul class="space-y-1 text-sm">
            @for (category of plan.emptiedCategories; track category.slug) {
              <li>{{ category.name }}</li>
            }
          </ul>
        }

        @if (plan.keptManual.length > 0) {
          <h3 class="mt-6 mb-1 text-sm font-semibold">{{ text.keptTitle }}</h3>
          <p class="mb-2 text-sm text-subtle">{{ text.keptHint }}</p>
          <ul class="space-y-1 text-sm">
            @for (kept of plan.keptManual; track kept.sourceId) {
              <li>{{ kept.name }}</li>
            }
          </ul>
        }

        @if (plan.truncated) {
          <p class="mt-4 text-sm text-subtle">{{ text.truncated }}</p>
        }

        <!-- The delete gate: typed confirmation, and only when it applies. -->
        @if (plan.summary.softDelete > 0) {
          <div class="mt-6 rounded-md border border-red-200 bg-red-50 p-3">
            <p class="text-sm text-red-800">
              {{ deleteWarning(plan.summary.softDelete) }}
            </p>
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

        @if (!isNoop(plan)) {
          <div class="mt-6 flex items-center gap-3">
            <button
              appButton
              type="button"
              [disabled]="!canApply(plan) || applying()"
              (click)="apply(response.run.id)"
            >
              {{ applying() ? text.applying : text.apply }}
            </button>
          </div>
        }

        @if (applyError()) {
          <p class="mt-3 text-sm text-red-700" role="alert">
            {{ text.applyError }}
          </p>
        }
      </section>
    }

    @if (appliedRun(); as run) {
      <p class="mb-8 rounded-md bg-stone-100 p-3 text-sm" role="status">
        {{ text.applied }} {{ changeSummary(run) }}
        <a routerLink="/catalog" class="ml-2 underline">{{
          catalogText.navLabel
        }}</a>
      </p>
    }

    <!-- The audit trail -->
    <section>
      <h2 class="mb-3 text-lg font-semibold">{{ text.historyTitle }}</h2>
      @if (runs.hasValue() && runs.value().runs.length > 0) {
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-subtle">
              <th class="py-2 font-medium">{{ text.col.date }}</th>
              <th class="py-2 font-medium">{{ text.col.file }}</th>
              <th class="py-2 font-medium">{{ text.col.actor }}</th>
              <th class="py-2 font-medium">{{ text.col.status }}</th>
              <th class="py-2 font-medium">{{ text.col.changes }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (run of runs.value().runs; track run.id) {
              <tr>
                <td class="py-2">{{ formatDate(run.startedAt) }}</td>
                <td class="py-2 text-subtle">{{ run.filename }}</td>
                <td class="py-2 text-subtle">{{ run.actorEmail }}</td>
                <td class="py-2">{{ text.status[run.status] }}</td>
                <td class="py-2 text-subtle">{{ changeSummary(run) }}</td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="text-muted">{{ text.historyEmpty }}</p>
      }
    </section>
  `,
})
export class SyncPage {
  private readonly sync = inject(SyncService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  protected readonly text = inject(ADMIN_TEXT).sync;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  protected readonly presets = SYNC_PRESETS;
  protected readonly flags = FLAGS;

  protected readonly preset = signal<SyncPresetName>('full');
  protected readonly options = signal<SyncOptions>(presetFor('full'));
  protected readonly file = signal<File | null>(null);
  protected readonly previewing = signal(false);
  protected readonly previewed = signal<SyncPreviewResponse | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly applying = signal(false);
  protected readonly applyError = signal(false);
  protected readonly appliedRun = signal<SyncRun | null>(null);
  protected readonly confirmation = signal('');
  protected readonly dragging = signal(false);

  protected readonly runs = resource({
    loader: () => this.sync.listRuns(),
  });

  protected selectPreset(name: SyncPresetName): void {
    this.preset.set(name);
    if (name !== 'custom') this.options.set(presetFor(name));
    // The staged run was computed with the old intent, so it no longer
    // describes what would happen.
    this.discardPreview();
  }

  protected isFlagOn(key: FlagKey): boolean {
    return FLAG_VALUE[key](this.options());
  }

  protected toggleFlag(key: FlagKey, on: boolean): void {
    this.options.update((current) => {
      const next = FLAG_SET[key](current, on);
      // Turning off the completeness claim withdraws the permission that
      // depends on it, rather than leaving an option the server would refuse.
      return next.productSetAuthoritative
        ? next
        : { ...next, softDeleteMissingProducts: false };
    });
    this.preset.set('custom');
    this.discardPreview();
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFile(input.files?.[0] ?? null);
  }

  /** Clearing the value first so re-choosing the same file still fires change. */
  protected openPicker(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  protected onDragOver(event: DragEvent): void {
    // Without preventDefault the browser navigates to the dropped file.
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.setFile(event.dataTransfer?.files?.[0] ?? null);
  }

  protected dropZoneClass(): string {
    if (this.dragging()) return 'border-primary bg-primary/5';
    return this.file()
      ? 'border-border-strong bg-stone-50'
      : 'border-border-strong hover:border-primary hover:bg-stone-50';
  }

  private setFile(file: File | null): void {
    if (!file) return;
    this.file.set(file);
    this.discardPreview();
  }

  protected async runPreview(): Promise<void> {
    const file = this.file();
    if (!file) return;

    this.previewing.set(true);
    this.previewError.set(null);
    this.appliedRun.set(null);
    try {
      const result = await this.sync.preview(file, this.options());
      if (result.ok) this.previewed.set(result.preview);
      else this.previewError.set(result.message);
    } finally {
      this.previewing.set(false);
    }
  }

  protected async apply(runId: string): Promise<void> {
    this.applying.set(true);
    this.applyError.set(false);
    try {
      const result = await this.sync.commit(runId);
      if (!result.ok) {
        this.applyError.set(true);
        return;
      }
      this.appliedRun.set(result.result.run);
      this.reset();
      this.runs.reload();
    } finally {
      this.applying.set(false);
    }
  }

  protected reset(): void {
    this.file.set(null);
    this.discardPreview();
  }

  private discardPreview(): void {
    this.previewed.set(null);
    this.previewError.set(null);
    this.confirmation.set('');
    this.applyError.set(false);
  }

  // --- Rendering helpers -------------------------------------------------

  protected isNoop(plan: SyncPlan): boolean {
    const { create, update, softDelete, restore, categoriesCreated } =
      plan.summary;
    return create + update + softDelete + restore + categoriesCreated === 0;
  }

  /** A run that hides products needs the confirmation word typed exactly. */
  protected canApply(plan: SyncPlan): boolean {
    if (plan.summary.softDelete === 0) return true;
    return this.confirmation().trim() === this.text.deleteConfirmWord;
  }

  protected summaryTiles(plan: SyncPlan) {
    const s = plan.summary;
    return [
      { label: 'create' as const, value: s.create, danger: false },
      { label: 'update' as const, value: s.update, danger: false },
      {
        label: 'softDelete' as const,
        value: s.softDelete,
        danger: s.softDelete > 0,
      },
      { label: 'restore' as const, value: s.restore, danger: false },
      {
        label: 'categories' as const,
        value: s.categoriesCreated,
        danger: false,
      },
      { label: 'unchanged' as const, value: s.unchanged, danger: false },
      { label: 'kept' as const, value: s.keptManual, danger: false },
      { label: 'errors' as const, value: s.errors, danger: s.errors > 0 },
    ];
  }

  /** Prices arrive as minor units; everything else is already display text. */
  protected display(field: string, value: string | number | null): string {
    if (value === null) return '—';
    if (typeof value === 'number') {
      return field.startsWith('price')
        ? formatPriceMinor(value, this.currency)
        : String(value);
    }
    return value;
  }

  protected badgeClass(kind: SyncProductChange['kind']): string {
    return KIND_BADGE[kind];
  }

  protected rowLabel(row: number): string {
    return this.text.errorRow.replace('{row}', String(row));
  }

  protected deleteWarning(count: number): string {
    return this.text.deleteWarning.replace('{count}', String(count));
  }

  protected confirmLabel(): string {
    return this.text.deleteConfirmLabel.replace(
      '{word}',
      this.text.deleteConfirmWord,
    );
  }

  protected changeSummary(run: SyncRun): string {
    const s = run.summary;
    return [
      `+${s.create}`,
      `~${s.update}`,
      `−${s.softDelete}`,
      s.errors > 0 ? `!${s.errors}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** Dates follow the deployment's locale, like prices do. */
  protected formatDate(iso: string): string {
    return new Intl.DateTimeFormat(this.currency.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
}

/** Keys of the option group, so a flag's label cannot name missing text. */
type SyncOptionKey = keyof AdminText['sync']['option'];

const KIND_BADGE: Record<SyncProductChange['kind'], string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-stone-200 text-stone-700',
  softDelete: 'bg-red-100 text-red-800',
  restore: 'bg-blue-100 text-blue-800',
};

/**
 * The advanced checkboxes. `name`/`category` are members of the `fields`
 * whitelist rather than booleans of their own, so each flag carries its own
 * read and write rather than the template branching on shape.
 */
type FlagKey =
  | 'name'
  | 'category'
  | 'createMissing'
  | 'updateExisting'
  | 'restoreReturning'
  | 'createCategories'
  | 'authoritative'
  | 'softDelete';

const FLAGS: { key: FlagKey; label: SyncOptionKey; hint?: SyncOptionKey }[] = [
  { key: 'name', label: 'name' },
  { key: 'category', label: 'category' },
  { key: 'createMissing', label: 'createMissing' },
  { key: 'updateExisting', label: 'updateExisting' },
  { key: 'restoreReturning', label: 'restoreReturning' },
  { key: 'createCategories', label: 'createCategories' },
  { key: 'authoritative', label: 'authoritative' },
  {
    key: 'softDelete',
    label: 'softDelete',
    hint: 'softDeleteHint',
  },
];

const FLAG_VALUE: Record<FlagKey, (o: SyncOptions) => boolean> = {
  name: (o) => o.fields.includes('name'),
  category: (o) => o.fields.includes('category'),
  createMissing: (o) => o.createMissing,
  updateExisting: (o) => o.updateExisting,
  restoreReturning: (o) => o.restoreReturning,
  createCategories: (o) => o.createCategories,
  authoritative: (o) => o.productSetAuthoritative,
  softDelete: (o) => o.softDeleteMissingProducts,
};

const FLAG_SET: Record<FlagKey, (o: SyncOptions, on: boolean) => SyncOptions> =
  {
    name: (o, on) => ({ ...o, fields: withField(o, 'name', on) }),
    category: (o, on) => ({ ...o, fields: withField(o, 'category', on) }),
    createMissing: (o, on) => ({ ...o, createMissing: on }),
    updateExisting: (o, on) => ({ ...o, updateExisting: on }),
    restoreReturning: (o, on) => ({ ...o, restoreReturning: on }),
    createCategories: (o, on) => ({ ...o, createCategories: on }),
    authoritative: (o, on) => ({ ...o, productSetAuthoritative: on }),
    softDelete: (o, on) => ({ ...o, softDeleteMissingProducts: on }),
  };

function withField(
  options: SyncOptions,
  field: (typeof SYNC_ALL_FIELDS)[number],
  on: boolean,
): SyncOptions['fields'] {
  const set = new Set(options.fields);
  if (on) set.add(field);
  else set.delete(field);
  return SYNC_ALL_FIELDS.filter((f) => set.has(f));
}
