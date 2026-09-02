import { Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SYNC_ALL_FIELDS,
  SyncFormatErrorBody,
  SyncOptions,
  SyncPlan,
  SyncPreviewResponse,
  SyncProductChange,
  SyncRowError,
  SyncRun,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminText } from '../../config/admin-text.type';
import { APP_TEXT } from '../../config/app-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { ChoiceCard } from '../../ui/choice-card';
import { FieldLabel } from '../../ui/field-label';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { SYNC_PRESETS, SyncPresetName, presetFor } from './sync-presets';
import { SyncService } from './sync.service';

/**
 * Fills `{placeholders}` in a line of admin text with the names the API sent
 * back from the admin's own file. The values are their data — a column header,
 * a price they typed — never wording of ours.
 */
function substitute(
  sentence: string,
  params: Record<string, string> | undefined,
): string {
  return Object.entries(params ?? {}).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    sentence,
  );
}

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
  imports: [
    Checkbox,
    ChoiceCard,
    RouterLink,
    Button,
    AdminIcon,
    FieldLabel,
    Input,
    StatusBadge,
  ],
  template: `
    <h1 class="mb-4 text-3xl font-medium tracking-tight">{{ text.title }}</h1>
    <p class="mb-6 max-w-3xl text-sm text-muted">{{ text.description }}</p>

    <!-- Narrower than the heading above it: everything below is a column of
         fields and rows to read down, not a table to scan across, and a line
         that runs the full width of a desktop is a line nobody follows. -->
    <div class="max-w-3xl">
      <!-- Step 1: what is this file? -->
      <section class="mb-8">
        <h2 class="mb-3 text-sm font-medium">{{ text.modeLabel }}</h2>
        <!-- Cards, the same control checkout uses for a choice that reshapes
           what follows: each preset needs a sentence, and the destructive one
           needs to be readable as the outlier it is. -->
        <div class="space-y-2">
          @for (option of presets; track option.name) {
            <app-choice-card
              name="preset"
              [value]="option.name"
              [checked]="preset() === option.name"
              [title]="text.mode[option.label]"
              [description]="option.hint ? text.mode[option.hint] : undefined"
              (chosen)="selectPreset(option.name)"
            />
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
                  appCheckbox
                  class="mt-0.5"
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
          <app-admin-icon name="upload" class="h-6 w-6 text-stone-400" />
          @if (file(); as chosen) {
            <span class="font-medium">{{ chosen.name }}</span>
            <span class="text-sm text-subtle">{{ text.changeFile }}</span>
          } @else {
            <span class="font-medium">{{ text.dropHint }}</span>
            <span class="text-sm text-primary underline">{{
              text.browse
            }}</span>
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
            <button
              appButton
              variant="secondary"
              type="button"
              (click)="reset()"
            >
              {{ text.discard }}
            </button>
          }
        </div>

        @if (previewError(); as message) {
          <p class="mt-3 text-sm text-red-700" role="alert">{{ message }}</p>
        }
      </section>

      <!-- Step 3: the diff -->
      @if (previewed(); as response) {
        @let plan = response.plan;
        <section class="mb-8 rounded-md border border-border p-4">
          <h2 class="mb-4 text-lg font-normal tracking-tight">
            {{ text.summaryTitle }}
          </h2>

          <dl class="mb-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            @for (tile of summaryTiles(plan); track tile.label) {
              <div>
                <dt class="text-subtle">{{ text.count[tile.label] }}</dt>
                <dd
                  class="text-lg font-medium"
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
            <h3 class="mt-6 mb-2 text-sm font-medium text-red-700">
              {{ text.errorsTitle }}
            </h3>
            <ul class="space-y-1 text-sm text-stone-700">
              @for (error of plan.rowErrors; track $index) {
                <li>
                  <span class="text-subtle">{{ rowLabel(error.row) }}</span>
                  — {{ rowErrorText(error) }}
                </li>
              }
            </ul>
          }

          @if (categoriesOfKind(plan, 'create'); as created) {
            @if (created.length > 0) {
              <h3 class="mt-6 mb-1 text-sm font-medium">
                {{ text.categoriesTitle }}
              </h3>
              <p class="mb-2 text-sm text-subtle">{{ text.categoriesHint }}</p>
              <ul class="space-y-1 text-sm">
                @for (category of created; track category.name) {
                  <li>
                    {{ category.name }}
                    <span class="text-subtle"
                      >({{ category.productCount }})</span
                    >
                  </li>
                }
              </ul>
            }
          }

          @if (categoriesOfKind(plan, 'rename'); as renamed) {
            @if (renamed.length > 0) {
              <h3 class="mt-6 mb-1 text-sm font-medium">
                {{ text.renamedCategoriesTitle }}
              </h3>
              <p class="mb-2 text-sm text-subtle">
                {{ text.renamedCategoriesHint }}
              </p>
              <ul class="space-y-1 text-sm">
                @for (category of renamed; track category.name) {
                  <li>
                    <span class="line-through text-subtle">{{
                      category.from
                    }}</span>
                    → {{ category.name }}
                    <span class="text-subtle"
                      >({{ category.productCount }})</span
                    >
                  </li>
                }
              </ul>
            }
          }

          @if (plan.products.length > 0) {
            <h3 class="mt-6 mb-2 text-sm font-medium">
              {{ text.productsTitle }}
            </h3>
            <ul class="divide-y divide-stone-100 text-sm">
              @for (product of plan.products; track product.sourceId) {
                <li class="flex flex-wrap items-baseline gap-x-3 py-2">
                  <span appStatusBadge [tone]="kindTone(product.kind)">
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
            <h3 class="mt-6 mb-1 text-sm font-medium">
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
            <h3 class="mt-6 mb-1 text-sm font-medium">
              {{ text.keptTitle }}
            </h3>
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

          @if (applyError(); as message) {
            <p class="mt-3 text-sm text-red-700" role="alert">
              {{ message }}
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
        <h2 class="mb-3 text-lg font-normal tracking-tight">
          {{ text.historyTitle }}
        </h2>
        @if (runs.hasValue() && runs.value().runs.length > 0) {
          <!-- Five short columns that are read across, not down: a phone
               scrolls them rather than stacking them into five labelled lines
               apiece. -->
          <div class="overflow-x-auto">
            <table class="w-full min-w-[36rem] text-sm">
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
          </div>
        } @else {
          <p class="text-muted">{{ text.historyEmpty }}</p>
        }
      </section>
    </div>
  `,
})
export class SyncPage {
  private readonly sync = inject(SyncService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  protected readonly text = inject(ADMIN_TEXT).sync;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  constructor() {
    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({ name: () => this.text.title });
  }

  protected readonly presets = SYNC_PRESETS;
  protected readonly flags = FLAGS;

  protected readonly preset = signal<SyncPresetName>('full');
  protected readonly options = signal<SyncOptions>(presetFor('full'));
  protected readonly file = signal<File | null>(null);
  protected readonly previewing = signal(false);
  protected readonly previewed = signal<SyncPreviewResponse | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly applying = signal(false);
  protected readonly applyError = signal<string | null>(null);
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
      else this.previewError.set(this.formatFailure(result.failure));
    } finally {
      this.previewing.set(false);
    }
  }

  /** The sentence for a skipped row, in this deployment's wording. */
  protected rowErrorText(error: SyncRowError): string {
    return substitute(this.text.rowErrors[error.code], error.params);
  }

  /**
   * The sentence for a refused file: this deployment's wording for the code,
   * with the names from the admin's own file substituted into it. A response
   * the client could not read at all falls back to the generic line.
   */
  private formatFailure(failure: SyncFormatErrorBody | null): string {
    if (!failure) return this.text.previewError;
    return substitute(this.text.formatErrors[failure.code], failure.params);
  }

  protected async apply(runId: string): Promise<void> {
    this.applying.set(true);
    this.applyError.set(null);
    try {
      const result = await this.sync.commit(runId);
      if (!result.ok) {
        this.applyError.set(this.text.applyErrors[result.code]);
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
    this.applyError.set(null);
  }

  // --- Rendering helpers -------------------------------------------------

  protected isNoop(plan: SyncPlan): boolean {
    const {
      create,
      update,
      softDelete,
      restore,
      categoriesCreated,
      categoriesRenamed,
    } = plan.summary;
    return (
      create +
        update +
        softDelete +
        restore +
        categoriesCreated +
        categoriesRenamed ===
      0
    );
  }

  protected categoriesOfKind(
    plan: SyncPlan,
    kind: SyncPlan['categories'][number]['kind'],
  ): SyncPlan['categories'] {
    return plan.categories.filter((category) => category.kind === kind);
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
      {
        label: 'renamedCategories' as const,
        value: s.categoriesRenamed,
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

  protected kindTone(kind: SyncProductChange['kind']): StatusTone {
    return KIND_TONE[kind];
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

/** What the run would do to a row, in the app's own status tones: a product
 * arriving is settled, one leaving is a refusal, one coming back is worth
 * pointing out, and a plain edit is neither. */
const KIND_TONE: Record<SyncProductChange['kind'], StatusTone> = {
  create: 'ok',
  update: 'neutral',
  softDelete: 'danger',
  restore: 'info',
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
