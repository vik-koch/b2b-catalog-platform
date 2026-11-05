import type { AdminExchangeText } from './exchange-text.type';
import { ADMIN_EXCHANGE_TEXT } from './exchange-text';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CATALOG_SYNC_ALL_FIELDS,
  CatalogSyncOptions,
  CatalogSyncPreviewResponse,
  SyncRun,
} from '@b2b-catalog-platform/shared/core/exchange';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { usePageSeo } from '../../platform/page-seo';
import { OwnershipService } from '../platform/ownership/ownership.service';
import {
  CATALOG_SYNC_PRESETS,
  CatalogSyncPresetName,
  catalogPresetFor,
} from './catalog-sync-presets';
import { syncChangeSummary } from './sync-run-format';
import { SyncFlag, SyncUpload, withField } from './sync-upload';
import { SyncService } from './sync.service';
import { SyncCatalogPlanView } from './ui/sync-catalog-plan-view';
import { SyncUploadForm } from './ui/sync-upload-form';

/**
 * A catalog upload (FR-ADM-02) at `/admin/sync/catalog/new`: the operator's
 * fallback for the feed. Hiding products is the whole risk, so it is offered
 * only for a file declared complete and its apply asks for a typed word.
 */
@Component({
  selector: 'app-catalog-sync-upload-page',
  imports: [
    Button,
    Link,
    PageHeader,
    RouterLink,
    SyncCatalogPlanView,
    SyncUploadForm,
  ],
  template: `
    <ui-page-header [title]="text.uploadTitle" [intro]="text.description">
      <a uiButton variant="secondary" routerLink="/admin/sync/catalog">
        {{ text.backToRuns }}
      </a>
    </ui-page-header>

    <div class="max-w-3xl">
      <!-- Replaced rather than disabled while the area is owned: a greyed
           form invites an attempt the API would refuse. -->
      @if (owned()) {
        <p
          class="rounded-md border border-edge bg-surface px-4 py-3 text-sm
                 text-ink-subtle"
          role="status"
        >
          {{ text.formatErrors['catalog-externally-owned'] }}
        </p>
      } @else {
        <app-sync-upload-form
          [presets]="presets"
          [preset]="upload.preset()"
          [flags]="flags()"
          [fileLabel]="text.file"
          [fileHint]="text.fileHint"
          [file]="upload.file()"
          [previewing]="upload.previewing()"
          [previewed]="!!upload.previewed()"
          [error]="upload.previewError()"
          (presetChosen)="upload.selectPreset($any($event))"
          (flagToggled)="toggleFlag($event.key, $event.on)"
          (fileChosen)="upload.setFile($event)"
          (previewRequested)="upload.runPreview()"
          (discarded)="upload.reset()"
        />

        @if (upload.previewed(); as response) {
          <div class="mb-8">
            <app-sync-catalog-plan-view
              [plan]="response.plan"
              [applicable]="true"
              [busy]="upload.applying()"
              [error]="upload.applyError()"
              (apply)="upload.apply()"
            />
          </div>
        }

        @if (upload.appliedRun(); as run) {
          <p class="mb-8 rounded-md bg-surface p-3 text-sm" role="status">
            {{ text.applied }} {{ changeSummary(run) }}
            <a uiLink routerLink="/catalog" class="ml-2">{{
              navText.catalog
            }}</a>
          </p>
        }
      }
    </div>
  `,
})
export class CatalogSyncUploadPage {
  protected readonly text = inject(ADMIN_EXCHANGE_TEXT).sync;
  protected readonly navText = inject(SHARED_TEXT).nav;
  private readonly ownership = inject(OwnershipService);
  private readonly sync = inject(SyncService);

  protected readonly owned = computed(() => this.ownership.owns('catalog'));

  protected readonly upload = new SyncUpload<
    CatalogSyncPresetName,
    CatalogSyncOptions,
    CatalogSyncPreviewResponse
  >({
    initial: 'full',
    custom: 'custom',
    presetFor: catalogPresetFor,
    preview: (file, options) => this.sync.previewCatalog(file, options),
  });

  protected readonly presets = CATALOG_SYNC_PRESETS.map((preset) => ({
    name: preset.name,
    title: this.text.mode[preset.label],
    description: preset.hint ? this.text.mode[preset.hint] : undefined,
  }));

  protected readonly flags = computed(() => {
    const options = this.upload.options();
    return FLAGS.map((flag) => ({
      key: flag.key,
      label: this.text.option[flag.label],
      hint: flag.hint ? this.text.option[flag.hint] : undefined,
      checked: flag.get(options),
      disabled: flag.disabled?.(options) ?? false,
    }));
  });

  constructor() {
    usePageSeo({ name: () => this.text.uploadTitle });
    void this.ownership.load();
  }

  protected toggleFlag(key: string, on: boolean): void {
    const flag = FLAGS.find((candidate) => candidate.key === key);
    if (!flag) return;
    const next = flag.set(this.upload.options(), on);
    // Withdrawing the completeness claim withdraws the hiding it allows.
    this.upload.setOptions(
      next.productSetAuthoritative
        ? next
        : { ...next, softDeleteMissingProducts: false },
    );
  }

  protected changeSummary(run: SyncRun): string {
    return syncChangeSummary(run.summary);
  }
}

type CatalogFlag = SyncFlag<
  CatalogSyncOptions,
  keyof AdminExchangeText['sync']['option']
>;

const field = (
  name: (typeof CATALOG_SYNC_ALL_FIELDS)[number],
): CatalogFlag => ({
  key: name,
  label: name,
  get: (o) => o.fields.includes(name),
  set: (o, on) => ({
    ...o,
    fields: withField(CATALOG_SYNC_ALL_FIELDS, o.fields, name, on),
  }),
});

const FLAGS: readonly CatalogFlag[] = [
  field('name'),
  field('category'),
  field('stock'),
  field('taxRate'),
  {
    key: 'createMissing',
    label: 'createMissing',
    get: (o) => o.createMissing,
    set: (o, on) => ({ ...o, createMissing: on }),
  },
  {
    key: 'updateExisting',
    label: 'updateExisting',
    get: (o) => o.updateExisting,
    set: (o, on) => ({ ...o, updateExisting: on }),
  },
  {
    key: 'restoreReturning',
    label: 'restoreReturning',
    get: (o) => o.restoreReturning,
    set: (o, on) => ({ ...o, restoreReturning: on }),
  },
  {
    key: 'createCategories',
    label: 'createCategories',
    get: (o) => o.createCategories,
    set: (o, on) => ({ ...o, createCategories: on }),
  },
  {
    key: 'authoritative',
    label: 'authoritative',
    get: (o) => o.productSetAuthoritative,
    set: (o, on) => ({ ...o, productSetAuthoritative: on }),
  },
  {
    key: 'softDelete',
    label: 'softDelete',
    hint: 'softDeleteHint',
    get: (o) => o.softDeleteMissingProducts,
    set: (o, on) => ({ ...o, softDeleteMissingProducts: on }),
    disabled: (o) => !o.productSetAuthoritative,
  },
];
