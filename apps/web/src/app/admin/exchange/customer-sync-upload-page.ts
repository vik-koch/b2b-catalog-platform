import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import {
  CUSTOMER_SYNC_CSV_COLUMNS,
  CUSTOMER_SYNC_FIELDS,
  CustomerSyncOptions,
  CustomerSyncPreviewResponse,
  SyncRun,
} from '@b2b-catalog-platform/shared/core/exchange';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { PageHeader } from '@b2b-catalog-platform/ui/content/page-header';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { AdminText } from '../../shared/config/admin-text.type';
import { usePageSeo } from '../../shared/core/page-seo';
import { OwnershipService } from '../platform/ownership/ownership.service';
import {
  CUSTOMER_SYNC_PRESETS,
  CustomerSyncPresetName,
  customerPresetFor,
} from './customer-sync-presets';
import { syncChangeSummary } from './sync-run-format';
import { SyncFlag, SyncUpload, withField } from './sync-upload';
import { SyncService } from './sync.service';
import { SyncCustomerPlanView } from './ui/sync-customer-plan-view';
import { SyncUploadForm } from './ui/sync-upload-form';

/**
 * A customer upload (FR-ADM-12) at `/admin/sync/customers/new`. Admin-only:
 * bringing accounts into being from a file is a deployment act, though a
 * manager may answer the staged run.
 */
@Component({
  selector: 'app-customer-sync-upload-page',
  imports: [
    Button,
    Link,
    PageHeader,
    RouterLink,
    SyncCustomerPlanView,
    SyncUploadForm,
  ],
  template: `
    <ui-page-header
      [title]="text.customers.uploadTitle"
      [intro]="text.customers.uploadDescription"
    >
      <a uiButton variant="secondary" routerLink="/admin/sync/customers">
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
          {{ text.formatErrors['customers-externally-owned'] }}
        </p>
      } @else {
        <app-sync-upload-form
          [presets]="presets"
          [preset]="upload.preset()"
          [flags]="flags()"
          [fileLabel]="text.customers.file"
          [fileHint]="fileHint"
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
            <app-sync-customer-plan-view
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
            <a uiLink routerLink="/admin/users" class="ml-2">{{
              usersText.customersPage.title
            }}</a>
          </p>
        }
      }
    </div>
  `,
})
export class CustomerSyncUploadPage {
  protected readonly text = inject(ADMIN_TEXT).sync;
  protected readonly usersText = inject(ADMIN_TEXT).users.list;
  private readonly ownership = inject(OwnershipService);
  private readonly sync = inject(SyncService);

  protected readonly owned = computed(() => this.ownership.owns('customers'));

  protected readonly upload = new SyncUpload<
    CustomerSyncPresetName,
    CustomerSyncOptions,
    CustomerSyncPreviewResponse
  >({
    initial: 'full',
    custom: 'custom',
    presetFor: customerPresetFor,
    preview: (file, options) => this.sync.previewCustomers(file, options),
  });

  protected readonly presets = CUSTOMER_SYNC_PRESETS.map((preset) => ({
    name: preset.name,
    title: this.text.customers.mode[preset.label],
    description: preset.hint
      ? this.text.customers.mode[preset.hint]
      : undefined,
  }));

  protected readonly flags = computed(() => {
    const options = this.upload.options();
    return FLAGS.map((flag) => ({
      key: flag.key,
      label: this.text.customers.option[flag.label],
      checked: flag.get(options),
      disabled: false,
    }));
  });

  /** The columns from the contract, so the hint cannot fall out of date. */
  protected readonly fileHint = fillText(this.text.customers.fileHint, {
    columns: CUSTOMER_SYNC_CSV_COLUMNS.join(', '),
  });

  constructor() {
    usePageSeo({ name: () => this.text.customers.uploadTitle });
    void this.ownership.load();
  }

  protected toggleFlag(key: string, on: boolean): void {
    const flag = FLAGS.find((candidate) => candidate.key === key);
    if (flag) this.upload.setOptions(flag.set(this.upload.options(), on));
  }

  /** The mails are the figure somebody will be asked about. */
  protected changeSummary(run: SyncRun): string {
    return syncChangeSummary(run.summary, { mailed: true });
  }
}

type CustomerFlag = SyncFlag<
  CustomerSyncOptions,
  keyof AdminText['sync']['customers']['option']
>;

const field = (name: (typeof CUSTOMER_SYNC_FIELDS)[number]): CustomerFlag => ({
  key: name,
  label: name,
  get: (o) => o.fields.includes(name),
  set: (o, on) => ({
    ...o,
    fields: withField(CUSTOMER_SYNC_FIELDS, o.fields, name, on),
  }),
});

const FLAGS: readonly CustomerFlag[] = [
  field('email'),
  field('tier'),
  field('company'),
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
    key: 'claimByEmail',
    label: 'claimByEmail',
    get: (o) => o.claimByEmail,
    set: (o, on) => ({ ...o, claimByEmail: on }),
  },
];
