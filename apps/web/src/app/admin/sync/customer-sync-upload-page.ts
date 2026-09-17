import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CUSTOMER_SYNC_CSV_COLUMNS,
  CUSTOMER_SYNC_FIELDS,
  CustomerSyncOptions,
  CustomerSyncPreviewResponse,
  SyncFormatErrorBody,
  SyncRun,
  fillText,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminText } from '../../config/admin-text.type';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { ChoiceCard } from '../../ui/choice-card';
import { DROP_ZONE, dropZoneState } from '../../ui/drop-zone';
import { FieldLabel } from '../../ui/field-label';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Link } from '../../ui/link';
import { SettingsService } from '../settings/settings.service';
import {
  CUSTOMER_SYNC_PRESETS,
  CustomerSyncPresetName,
  customerPresetFor,
} from './customer-sync-presets';
import { SyncCustomerPlanView } from './sync-customer-plan-view';
import { SyncService } from './sync.service';

/**
 * A manual customer import (FR-ADM-12) at `/admin/sync/customers/new`: pick
 * what the file is, upload it, read what it would do to people, apply it.
 *
 * A sibling of the catalog's upload screen rather than a parameterised version
 * of it, for the reason the two plan views are siblings: the steps are the
 * same three and every sentence on them is a different sentence. What this one
 * has that the catalog's has not is the mail count — a file of customers is
 * read by a person to find out how many of them are about to be written to,
 * and the preview answers that before anything is applied.
 *
 * It exists for the case the automated exchange does not cover: a deployment
 * going live with customers whose tiers are already settled somewhere else. So
 * it is closed exactly while an external system holds the pen (FR-ADM-10) —
 * the same rule the catalog upload lives under, and the API refuses it there
 * too rather than trusting this screen.
 */
@Component({
  selector: 'app-customer-sync-page',
  imports: [
    AdminIcon,
    Button,
    Checkbox,
    ChoiceCard,
    FieldLabel,
    Link,
    RouterLink,
    SyncCustomerPlanView,
  ],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h1 class="text-3xl font-medium tracking-tight">
        {{ text.customers.uploadTitle }}
      </h1>
      <a
        appButton
        variant="secondary"
        routerLink="/admin/sync/customers"
        class="ml-auto"
      >
        {{ text.backToRuns }}
      </a>
    </div>
    <p class="mb-6 max-w-3xl text-sm text-muted">
      {{ text.customers.uploadDescription }}
    </p>

    <div class="max-w-3xl">
      <!-- Closed exactly while somebody else is doing the job. The form is
           replaced rather than disabled: there is nothing here to fill in, and
           a greyed form invites an attempt the API would refuse anyway. -->
      @if (customersOwned()) {
        <p
          class="rounded-md border border-border bg-stone-100 px-4 py-3 text-sm text-muted"
          role="status"
        >
          {{ text.formatErrors['customers-externally-owned'] }}
        </p>
      } @else {
        <!-- Step 1: what is this file? -->
        <section class="mb-8">
          <h2 class="mb-3 text-sm font-medium">{{ text.modeLabel }}</h2>
          <div class="space-y-2">
            @for (option of presets; track option.name) {
              <app-choice-card
                name="preset"
                [value]="option.name"
                [checked]="preset() === option.name"
                [title]="text.customers.mode[option.label]"
                [description]="
                  option.hint ? text.customers.mode[option.hint] : undefined
                "
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
                    (change)="toggleFlag(flag.key, $any($event.target).checked)"
                  />
                  <span>{{ text.customers.option[flag.key] }}</span>
                </label>
              }
            </div>
          </details>
        </section>

        <!-- Step 2: the file -->
        <section class="mb-8">
          <span appFieldLabel>{{ text.customers.file }}</span>

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
          <!-- The columns, listed rather than described: the file is written by
               whoever is holding the other system's export, and the one thing
               they need from this screen is the spelling. -->
          <p class="mt-1 text-sm text-subtle">{{ fileHint }}</p>

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
            <app-sync-customer-plan-view
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
            <a appLink routerLink="/admin/users" class="ml-2">{{
              usersText.titleCustomers
            }}</a>
          </p>
        }
      }
    </div>
  `,
})
export class CustomerSyncUploadPage {
  private readonly sync = inject(SyncService);
  private readonly ownership = inject(SettingsService);
  protected readonly text = inject(ADMIN_TEXT).sync;
  /** Where an applied run's accounts are: the customer list, named by its own
   * heading rather than by a second word for the same screen. */
  protected readonly usersText = inject(ADMIN_TEXT).userList;

  /** Whether an external system owns the customer accounts (FR-ADM-10). */
  protected readonly customersOwned = computed(
    () => this.ownership.ownedAreas()?.includes('customers') ?? false,
  );

  constructor() {
    usePageSeo({ name: () => this.text.customers.uploadTitle });
    void this.ownership.load();
  }

  protected readonly presets = CUSTOMER_SYNC_PRESETS;
  protected readonly flags = FLAGS;
  /** The column names, straight from the contract: a list restated in wording
   * is a list that goes out of date without anything failing. */
  protected readonly fileHint = fillText(this.text.customers.fileHint, {
    columns: CUSTOMER_SYNC_CSV_COLUMNS.join(', '),
  });

  protected readonly preset = signal<CustomerSyncPresetName>('full');
  protected readonly options = signal<CustomerSyncOptions>(
    customerPresetFor('full'),
  );
  protected readonly file = signal<File | null>(null);
  protected readonly previewing = signal(false);
  protected readonly previewed = signal<CustomerSyncPreviewResponse | null>(
    null,
  );
  protected readonly previewError = signal<string | null>(null);
  protected readonly applying = signal(false);
  protected readonly applyError = signal<string | null>(null);
  protected readonly appliedRun = signal<SyncRun | null>(null);
  protected readonly dragging = signal(false);

  protected selectPreset(name: CustomerSyncPresetName): void {
    this.preset.set(name);
    if (name !== 'custom') this.options.set(customerPresetFor(name));
    // The staged run was computed with the old intent, so it no longer
    // describes what would happen.
    this.discardPreview();
  }

  protected isFlagOn(key: FlagKey): boolean {
    return FLAG_VALUE[key](this.options());
  }

  protected toggleFlag(key: FlagKey, on: boolean): void {
    this.options.update((current) => FLAG_SET[key](current, on));
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
      const result = await this.sync.previewCustomers(file, this.options());
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

  /** What a finished run came to, in the figures worth one line. The mail
   * count is one of them here: it is the figure somebody will be asked about. */
  protected changeSummary(run: SyncRun): string {
    const s = run.summary;
    if (!s) return '';
    return [
      s.create > 0 ? `+${s.create}` : '',
      s.update > 0 ? `~${s.update}` : '',
      s.softDelete > 0 ? `−${s.softDelete}` : '',
      s.mailed > 0 ? `✉${s.mailed}` : '',
      s.errors > 0 ? `!${s.errors}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}

/** Keys of the option group, so a flag's label cannot name missing text. */
type CustomerOptionKey = keyof AdminText['sync']['customers']['option'];

/**
 * The advanced checkboxes. The three writable fields are members of the
 * `fields` whitelist rather than booleans of their own, so each flag carries
 * its own read and write rather than the template branching on shape.
 */
type FlagKey = CustomerOptionKey;

const FLAGS: { key: FlagKey }[] = [
  { key: 'email' },
  { key: 'tier' },
  { key: 'company' },
  { key: 'createMissing' },
  { key: 'updateExisting' },
];

const FLAG_VALUE: Record<FlagKey, (o: CustomerSyncOptions) => boolean> = {
  email: (o) => o.fields.includes('email'),
  tier: (o) => o.fields.includes('tier'),
  company: (o) => o.fields.includes('company'),
  createMissing: (o) => o.createMissing,
  updateExisting: (o) => o.updateExisting,
};

const FLAG_SET: Record<
  FlagKey,
  (o: CustomerSyncOptions, on: boolean) => CustomerSyncOptions
> = {
  email: (o, on) => ({ ...o, fields: withField(o, 'email', on) }),
  tier: (o, on) => ({ ...o, fields: withField(o, 'tier', on) }),
  company: (o, on) => ({ ...o, fields: withField(o, 'company', on) }),
  createMissing: (o, on) => ({ ...o, createMissing: on }),
  updateExisting: (o, on) => ({ ...o, updateExisting: on }),
};

function withField(
  options: CustomerSyncOptions,
  field: (typeof CUSTOMER_SYNC_FIELDS)[number],
  on: boolean,
): CustomerSyncOptions['fields'] {
  const set = new Set(options.fields);
  if (on) set.add(field);
  else set.delete(field);
  return CUSTOMER_SYNC_FIELDS.filter((f) => set.has(f));
}
