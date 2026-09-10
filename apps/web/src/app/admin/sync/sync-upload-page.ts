import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  SYNC_ALL_FIELDS,
  SyncFormatErrorBody,
  SyncOptions,
  SyncPreviewResponse,
  SyncRun,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminText } from '../../config/admin-text.type';
import { APP_TEXT } from '../../config/app-text';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { ChoiceCard } from '../../ui/choice-card';
import { DROP_ZONE, dropZoneState } from '../../ui/drop-zone';
import { FieldLabel } from '../../ui/field-label';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Link } from '../../ui/link';
import { SyncPlanView } from './sync-plan-view';
import { presetFor, SYNC_PRESETS, SyncPresetName } from './sync-presets';
import { SyncService } from './sync.service';

/**
 * A manual catalog upload (FR-ADM-02) at `/admin/sync/new`: pick what the file
 * is, upload it, read the diff, apply it.
 *
 * The operator's own way in, and deliberately still the whole of it: an
 * automated feed submits the same rows to the same engine (FR-ADM-07), and
 * this is what a shop falls back on when that breaks or when a run needs
 * correcting by hand. The log every run lands in, machine and manual alike,
 * is the screen this one opens from.
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
    SyncPlanView,
    Link,
  ],
  template: `
    <div class="mb-4 md:mb-6 flex flex-wrap items-center gap-3">
      <h1 class="text-3xl font-medium tracking-tight">
        {{ text.uploadTitle }}
      </h1>
      <a appButton variant="secondary" routerLink="/admin/sync" class="ml-auto">
        {{ text.backToRuns }}
      </a>
    </div>
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
              <label class="flex cursor-pointer items-start gap-2 text-sm">
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
          class="w-full p-4"
          [class]="dropZoneClass()"
          (click)="openPicker(fileInput)"
          (dragover)="onDragOver($event)"
          (dragleave)="dragging.set(false)"
          (drop)="onDrop($event)"
        >
          <app-admin-icon name="upload" class="h-6 w-6 mb-2" />
          @if (file(); as chosen) {
            <span class="font-medium">{{ chosen.name }}</span>
            <span class="text-sm text-subtle">{{ text.changeFile }}</span>
          } @else {
            <span class="font-medium">{{ text.dropHint }}</span>
            <span class="text-sm">{{ text.browse }}</span>
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
        <div class="mb-8">
          <app-sync-plan-view
            [plan]="response.plan"
            [applicable]="true"
            [busy]="applying()"
            [error]="applyError()"
            (apply)="apply(response.run.id)"
          />
        </div>
      }

      @if (appliedRun(); as run) {
        <p class="mb-8 rounded-md bg-stone-100 p-3 text-sm" role="status">
          {{ text.applied }} {{ changeSummary(run) }}
          <a appLink routerLink="/catalog" class="ml-2">{{
            catalogText.navLabel
          }}</a>
        </p>
      }
    </div>
  `,
})
export class SyncUploadPage {
  private readonly sync = inject(SyncService);
  protected readonly text = inject(ADMIN_TEXT).sync;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  constructor() {
    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({ name: () => this.text.uploadTitle });
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
  protected readonly dragging = signal(false);

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
    return `${DROP_ZONE} ${dropZoneState(this.dragging(), !!this.file())}`;
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

  /**
   * The sentence for a refused file: this deployment's wording for the code,
   * with the names from the admin's own file substituted into it. A response
   * the client could not read at all falls back to the generic line.
   */
  private formatFailure(failure: SyncFormatErrorBody | null): string {
    if (!failure) return this.text.previewError;
    return fillText(this.text.formatErrors[failure.code], failure.params ?? {});
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
    this.applyError.set(null);
  }

  /** What a finished run came to, in the four figures worth one line. */
  protected changeSummary(run: SyncRun): string {
    const s = run.summary;
    if (!s) return '';
    return [
      s.create > 0 ? `+${s.create}` : '',
      s.update > 0 ? `~${s.update}` : '',
      s.softDelete > 0 ? `−${s.softDelete}` : '',
      s.errors > 0 ? `!${s.errors}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}

/** Keys of the option group, so a flag's label cannot name missing text. */
type SyncOptionKey = keyof AdminText['sync']['option'];

/**
 * The advanced checkboxes. `name`/`category`/`stock` are members of the
 * `fields` whitelist rather than booleans of their own, so each flag carries
 * its own read and write rather than the template branching on shape.
 */
type FlagKey =
  | 'name'
  | 'category'
  | 'stock'
  | 'createMissing'
  | 'updateExisting'
  | 'restoreReturning'
  | 'createCategories'
  | 'authoritative'
  | 'softDelete';

const FLAGS: { key: FlagKey; label: SyncOptionKey; hint?: SyncOptionKey }[] = [
  { key: 'name', label: 'name' },
  { key: 'category', label: 'category' },
  { key: 'stock', label: 'stock' },
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
  stock: (o) => o.fields.includes('stock'),
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
    stock: (o, on) => ({ ...o, fields: withField(o, 'stock', on) }),
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
