import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_LINK_MAX_LENGTH,
  DocumentInput,
  DocumentProduct,
  StoredDocumentFile,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { FieldLabel } from '../../ui/field-label';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { DateField } from '../../ui/date-field';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { injectEditorReturn } from '../editor-return';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { documentFileLabel, documentFileSize } from '../../core/document-file';
import { DROP_ZONE, dropZoneState } from '../../ui/drop-zone';
import { DocumentProductsPicker } from './document-products-picker';
import { DocumentsService } from './documents.service';

/**
 * Add or edit a document (FR-DOC-01/02/05) at `/admin/documents/new` and
 * `/admin/documents/:id/edit`. One screen for both, and one save: the file, the
 * title, the dates and the products it is shown on are one record, and a
 * two-step upload would only leave half a row behind when somebody walked away.
 *
 * Replacing the file is this same form — which is the whole of how a re-issued
 * document supersedes the one before it. The row keeps its identity, so
 * everything pointing at it keeps pointing at it.
 *
 * The bytes go up as soon as they are chosen, the way a catalog image does:
 * what the form holds is the stored file, and saving writes a pointer.
 *
 * The file and the link are each optional, never both missing: a register
 * entry is a document whether or not anyone has its PDF.
 */
@Component({
  selector: 'app-document-editor-page',
  imports: [
    Button,
    IconButton,
    AdminIcon,
    DateField,
    DocumentProductsPicker,
    FieldLabel,
    Input,
    Skeleton,
  ],
  template: `
    <h1 class="mb-4 text-3xl font-medium tracking-tight">
      {{ isNew ? text.newTitle : text.editTitle }}
    </h1>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    } @else if (!isNew && !loaded()) {
      <p class="text-muted" role="alert">{{ text.notFound }}</p>
    } @else {
      <div class="max-w-3xl space-y-6">
        <label class="block">
          <span appFieldLabel>
            {{ text.title }}
            <span class="text-accent" aria-hidden="true">*</span>
          </span>
          <input
            type="text"
            appInput
            class="w-full"
            [placeholder]="text.titlePlaceholder"
            [value]="title()"
            (input)="title.set($any($event.target).value)"
          />
          <span class="mt-1 block text-xs text-subtle">{{
            text.titleHint
          }}</span>
        </label>

        <div class="block">
          <span appFieldLabel>{{ text.file }}</span>

          <input
            #fileInput
            type="file"
            class="hidden"
            [accept]="accept"
            (change)="onFile($event)"
          />

          @if (file(); as stored) {
            <!-- What is stored, and the two things to do with it. The file's
                 own name is the line, because the stored name is a hash and
                 the title above is what the shop calls it. -->
            <div
              class="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
            >
              <!-- The name keeps a readable width; on a phone the three
                   controls take the next line rather than squeeze it. -->
              <span class="flex min-w-0 flex-1 basis-48 items-center gap-3">
                <app-admin-icon
                  name="file-text"
                  class="h-5 w-5 shrink-0 text-subtle"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm">{{ stored.name }}</span>
                  <span class="block text-xs text-subtle">{{
                    meta(stored)
                  }}</span>
                </span>
              </span>
              <span class="ml-auto flex shrink-0 items-center gap-2">
                <a
                  appIconButton
                  [href]="stored.url"
                  target="_blank"
                  rel="noopener"
                  [attr.aria-label]="text.open"
                  [title]="text.open"
                >
                  <app-admin-icon name="external-link" />
                </a>
                <button
                  appButton
                  variant="secondary"
                  type="button"
                  class="shrink-0 gap-2"
                  [disabled]="uploading()"
                  (click)="fileInput.click()"
                >
                  <app-admin-icon name="upload" class="h-4 w-4" />
                  {{ uploading() ? common.uploading : text.replace }}
                </button>
                <!-- Leaves the link as the document; the bytes go when the
                   sweep finds nothing pointing at them. -->
                <button
                  appIconButton
                  type="button"
                  [attr.aria-label]="text.removeFile"
                  [title]="text.removeFile"
                  (click)="file.set(null)"
                >
                  <app-admin-icon name="trash-2" />
                </button>
              </span>
            </div>
          } @else {
            <!-- The same dashed target the sync screen and the image tiles
                 wear: choosing a file is one gesture in this panel, so it has
                 one shape. The picker is the drop target too — a dashed box
                 that refused a dropped file would be promising something it
                 does not do. -->
            <button
              type="button"
              class="w-full p-4"
              [class]="dropZoneClass()"
              [disabled]="uploading()"
              (click)="fileInput.click()"
              (dragover)="onDragOver($event)"
              (dragleave)="dragging.set(false)"
              (drop)="onDrop($event)"
            >
              <app-admin-icon name="upload" class="h-6 w-6 mb-2" />
              <span class="font-medium">{{
                uploading() ? common.uploading : text.dropHint
              }}</span>
              <span class="text-sm">{{ text.choose }}</span>
            </button>
          }
          <span class="mt-1 block text-xs text-subtle">{{
            text.fileHint
          }}</span>
        </div>

        <!-- Where the document is held elsewhere (FR-DOC-05). Beside the file
             rather than instead of it: both are ways to the same paper. -->
        <div class="block">
          <label [for]="linkId" appFieldLabel>{{ text.link }}</label>
          <div class="flex items-center gap-2">
            <input
              [id]="linkId"
              type="url"
              inputmode="url"
              autocomplete="off"
              [maxLength]="linkMax"
              appInput
              class="min-w-0 flex-1"
              [placeholder]="text.linkPlaceholder"
              [value]="link()"
              (input)="link.set($any($event.target).value)"
            />
            @if (linkValid()) {
              <a
                appIconButton
                [href]="link().trim()"
                target="_blank"
                rel="noopener"
                [attr.aria-label]="text.openLink"
                [title]="text.openLink"
              >
                <app-admin-icon name="external-link" />
              </a>
            }
          </div>
          <span class="mt-1 block text-xs text-subtle">{{
            text.linkHint
          }}</span>
        </div>

        <!-- Two dates copied off the document, side by side because that is how
             they are read off it; one per line below sm. The same field the
             checkout picks a delivery day in — one date control in the app,
             whoever is filling it in. -->
        <div class="grid gap-6 sm:grid-cols-2">
          <div>
            <label [for]="issuedId" appFieldLabel>{{ text.issuedAt }}</label>
            <app-date-field
              [fieldId]="issuedId"
              [value]="issuedAt() || null"
              [placeholder]="common.datePlaceholder"
              (valueChange)="issuedAt.set($event ?? '')"
            />
          </div>
          <div>
            <label [for]="expiresId" appFieldLabel>{{ text.expiresAt }}</label>
            <app-date-field
              [fieldId]="expiresId"
              [value]="expiresAt() || null"
              [placeholder]="common.datePlaceholder"
              (valueChange)="expiresAt.set($event ?? '')"
            />
          </div>
        </div>
        <p class="text-xs text-subtle">{{ text.datesHint }}</p>

        <!-- Where the links are made (FR-DOC-02). The product's own form only
             lists them, so this is the one screen that writes them. -->
        <app-document-products-picker
          [value]="products()"
          (valueChange)="products.set($event)"
        />
      </div>

      @if (error()) {
        <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
      }

      <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
        <button
          appButton
          type="button"
          class="gap-2"
          [disabled]="saving()"
          (click)="save()"
        >
          <app-admin-icon name="save" class="h-4 w-4" />
          {{ saving() ? common.saving : common.save }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="cancel()"
        >
          <app-admin-icon name="x" class="h-4 w-4" />
          {{ common.cancel }}
        </button>
      </div>
    }
  `,
})
export class DocumentEditorPage implements UnsavedChangesAware {
  private readonly service = inject(DocumentsService);
  private readonly route = inject(ActivatedRoute);
  protected readonly text = inject(ADMIN_TEXT).documentEditor;
  protected readonly listText = inject(ADMIN_TEXT).documentList;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly accept = ACCEPTED_DOCUMENT_MIME_TYPES.join(',');
  protected readonly issuedId = 'document-issued-at';
  protected readonly expiresId = 'document-expires-at';
  protected readonly linkId = 'document-link';
  protected readonly linkMax = DOCUMENT_LINK_MAX_LENGTH;

  private readonly idParam = this.route.snapshot.paramMap.get('id');
  protected readonly isNew = this.idParam === null;

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedLoading(this.loading);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly title = signal('');
  protected readonly file = signal<StoredDocumentFile | null>(null);
  protected readonly link = signal('');
  protected readonly linkValid = computed(() => isWebLink(this.link().trim()));
  protected readonly products = signal<DocumentProduct[]>([]);
  protected readonly issuedAt = signal('');
  protected readonly expiresAt = signal('');

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
  private readonly close = injectEditorReturn();
  private readonly dirty = computed(() => this.snapshot() !== this.original);

  constructor() {
    usePageSeo({
      name: () => (this.isNew ? this.text.newTitle : this.text.editTitle),
    });
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return !this.navigatingAway && this.dirty();
  }

  protected meta(stored: StoredDocumentFile): string {
    return `${documentFileLabel(stored.contentType)} · ${documentFileSize(
      stored.byteSize,
      this.listText,
    )}`;
  }

  private async load(): Promise<void> {
    if (this.isNew) {
      this.original = this.snapshot();
      this.loading.set(false);
      return;
    }
    const document = await this.service.get(this.idParam as string);
    if (document) {
      this.title.set(document.title);
      this.file.set(document.file);
      this.link.set(document.link ?? '');
      this.products.set(document.products);
      this.issuedAt.set(document.issuedAt ?? '');
      this.expiresAt.set(document.expiresAt ?? '');
      this.original = this.snapshot();
      this.loaded.set(true);
    }
    this.loading.set(false);
  }

  private snapshot(): string {
    return JSON.stringify({
      title: this.title(),
      file: this.file(),
      link: this.link().trim(),
      issuedAt: this.issuedAt(),
      expiresAt: this.expiresAt(),
      products: this.products().map((p) => p.slug),
    });
  }

  /**
   * The bytes go up on choice, not on save: an upload that fails has to say so
   * while the admin is still looking at the file picker, and the save that
   * follows is then a plain JSON write like every other record's.
   */
  /** Whether a file is over the empty picker. */
  protected readonly dragging = signal(false);

  protected dropZoneClass(): string {
    return `${DROP_ZONE} ${dropZoneState(this.dragging())}`;
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) void this.upload(dropped);
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!chosen) return;
    await this.upload(chosen);
  }

  private async upload(chosen: File): Promise<void> {
    this.uploading.set(true);
    this.error.set(null);
    try {
      this.file.set(await this.service.uploadFile(chosen));
    } catch {
      this.error.set(this.text.uploadError);
    } finally {
      this.uploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    const stored = this.file();
    if (!this.title().trim()) {
      this.error.set(this.text.titleRequired);
      return;
    }
    const link = this.link().trim() || null;
    if (link && !isWebLink(link)) {
      this.error.set(this.text.linkInvalid);
      return;
    }
    if (!stored && !link) {
      this.error.set(this.text.fileOrLinkRequired);
      return;
    }
    const issuedAt = this.issuedAt() || null;
    const expiresAt = this.expiresAt() || null;
    // The server refuses the pair as well, but a date typed the wrong way round
    // is a slip to answer beside the field rather than a round trip.
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      this.error.set(this.text.expiryBeforeIssue);
      return;
    }

    const body: DocumentInput = {
      title: this.title().trim(),
      file: stored,
      link,
      issuedAt,
      expiresAt,
      productSlugs: this.products().map((p) => p.slug),
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const result = this.isNew
        ? await this.service.create(body)
        : await this.service.update(this.idParam as string, body);
      if (!result.ok) {
        this.error.set(this.text.errors[result.code]);
        return;
      }
      this.navigatingAway = true;
      await this.close('/admin/documents');
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    await this.close('/admin/documents');
  }
}

/** What the API accepts as a link: an absolute http(s) URL. Checked here too
 * so a typo is answered beside the field rather than as a failed save. */
function isWebLink(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return Boolean(new URL(value).host);
  } catch {
    return false;
  }
}
