import { Component, computed, forwardRef, inject, signal } from '@angular/core';
import { form, maxLength, required, validate } from '@angular/forms/signals';
import { filled } from '../../shared/core/field-rules';
import { ActivatedRoute } from '@angular/router';
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_LINK_MAX_LENGTH,
  fillText,
} from '@b2b-catalog-platform/shared';
import {
  DocumentInput,
  DocumentProduct,
  StoredDocumentFile,
} from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '../../shared/ui/button';
import { FieldAttempt, FIELD_ATTEMPT } from '../../shared/ui/field-attempt';
import { FieldLabel } from '../../shared/ui/field-label';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { submitAttempt } from '../../shared/ui/submit-attempt';
import { IconButton } from '../../shared/ui/icon-button';
import { Icon } from '../../shared/ui/icons/icon';
import { DateField } from '../../shared/ui/date-field';
import { Input } from '../../shared/ui/input';
import { Skeleton } from '../../shared/ui/skeleton';
import { injectEditorReturn } from '../../shared/edit-mode/editor-return';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import {
  documentFileLabel,
  documentFileSize,
} from '../../shared/core/document-file';
import { DROP_ZONE, dropZoneState } from '../../shared/ui/drop-zone';
import { FileTarget, pasteKeys } from '../../shared/ui/file-target';
import { DocumentProductsPicker } from './document-products-picker';
import { DocumentsService } from './documents.service';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { Hint } from '../../shared/ui/hint';
import { externalLinkIcon } from '../../shared/ui/icons/glyphs/external-link';
import { fileTextIcon } from '../../shared/ui/icons/glyphs/file-text';
import { saveIcon } from '../../shared/ui/icons/glyphs/save';
import { trash2Icon } from '../../shared/ui/icons/glyphs/trash-2';
import { uploadIcon } from '../../shared/ui/icons/glyphs/upload';
import { xIcon } from '../../shared/ui/icons/glyphs/x';

interface DocumentDraft {
  title: string;
  link: string;
  /** ISO dates as the date inputs hold them; empty is no date. */
  issuedAt: string;
  expiresAt: string;
}

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
    FORM_FIELDS,
    Button,
    IconButton,
    Icon,
    DateField,
    DocumentProductsPicker,
    FieldLabel,
    FileTarget,
    Input,
    Skeleton,
    PageTitle,
    ErrorText,
    Hint,
  ],
  // No <form> element: the buttons under the page save or leave, so the page
  // says itself when the form has been sent.
  providers: [
    {
      provide: FIELD_ATTEMPT,
      useExisting: forwardRef(() => DocumentEditorPage),
    },
  ],
  template: `
    <h1 appPageTitle class="mb-4">
      {{ isNew ? text.newTitle : text.editTitle }}
    </h1>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    } @else if (!isNew && !loaded()) {
      <p class="text-ink-subtle" role="alert">{{ text.notFound }}</p>
    } @else {
      <div class="max-w-3xl space-y-6">
        <app-field
          [field]="form.title"
          [label]="text.title"
          [hint]="text.titleHint"
          controlId="document-title"
        >
          <input
            type="text"
            appInput
            class="w-full"
            [placeholder]="text.titlePlaceholder"
            [formField]="form.title"
          />
        </app-field>

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
              class="flex flex-wrap items-center gap-3 rounded-md border
                     border-edge p-3"
            >
              <!-- The name keeps a readable width; on a phone the three
                   controls take the next line rather than squeeze it. -->
              <span class="flex min-w-0 flex-1 basis-48 items-center gap-3">
                <app-icon
                  [glyph]="fileTextIcon"
                  class="size-5 shrink-0 text-ink-subtle"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm">{{ stored.name }}</span>
                  <span class="block text-xs text-ink-subtle">{{
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
                  <app-icon [glyph]="externalLinkIcon" />
                </a>
                <button
                  appButton
                  variant="secondary"
                  type="button"
                  class="shrink-0 gap-2"
                  [appFileTarget]="accept"
                  [disabled]="uploading()"
                  (click)="fileInput.click()"
                  (filesReceived)="upload($event[0])"
                >
                  <app-icon [glyph]="uploadIcon" class="size-4" />
                  {{ uploading() ? adminText.upload.progress : text.replace }}
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
                  <app-icon [glyph]="trash2Icon" />
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
              #target="appFileTarget"
              [appFileTarget]="accept"
              [class]="dropZoneClass(target.dragging())"
              [disabled]="uploading()"
              (click)="fileInput.click()"
              (filesReceived)="upload($event[0])"
            >
              <app-icon [glyph]="uploadIcon" class="size-6 mb-2" />
              <span class="font-medium">{{
                uploading() ? adminText.upload.progress : text.dropHint
              }}</span>
              <span class="text-sm">{{ text.choose }}</span>
              <span class="hidden text-xs pointer-fine:block">{{
                pasteHint
              }}</span>
            </button>
          }
          <span appHint class="mt-1">{{ text.fileHint }}</span>
        </div>

        <!-- Where the document is held elsewhere (FR-DOC-05). Beside the file
             rather than instead of it: both are ways to the same paper. -->
        <!-- No mark: what is required is a file or a link, which a star on
             one of them would misstate. The save says it if neither is there. -->
        <app-field
          [field]="form.link"
          [label]="text.link"
          [marker]="false"
          [hint]="text.linkHint"
          controlId="document-link"
        >
          <div class="flex items-center gap-2">
            <input
              type="url"
              inputmode="url"
              autocomplete="off"
              appInput
              class="min-w-0 flex-1"
              [placeholder]="text.linkPlaceholder"
              [formField]="form.link"
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
                <app-icon [glyph]="externalLinkIcon" />
              </a>
            }
          </div>
        </app-field>

        <!-- Two dates copied off the document, side by side because that is how
             they are read off it; one per line below sm. The same field the
             checkout picks a delivery day in — one date control in the app,
             whoever is filling it in. -->
        <div class="grid gap-6 sm:grid-cols-2">
          <app-field
            [field]="form.issuedAt"
            [label]="text.issuedAt"
            controlId="document-issued-at"
          >
            <app-date-field
              [field]="form.issuedAt"
              [placeholder]="text.datePlaceholder"
            />
          </app-field>
          <app-field
            [field]="form.expiresAt"
            [label]="text.expiresAt"
            controlId="document-expires-at"
          >
            <app-date-field
              [field]="form.expiresAt"
              [placeholder]="text.datePlaceholder"
            />
          </app-field>
        </div>
        <p class="text-xs text-ink-subtle">{{ text.datesHint }}</p>

        <!-- Where the links are made (FR-DOC-02). The product's own form only
             lists them, so this is the one screen that writes them. -->
        <app-document-products-picker
          [value]="products()"
          (valueChange)="products.set($event)"
        />
      </div>

      @if (error()) {
        <p appErrorText class="mt-4" role="alert">{{ error() }}</p>
      }

      <div class="mt-6 flex max-w-3xl flex-wrap gap-3">
        <button
          appButton
          type="button"
          class="gap-2"
          [disabled]="saving()"
          (click)="save()"
        >
          <app-icon [glyph]="saveIcon" class="size-4" />
          {{ saving() ? actionText.saving : adminText.actions.save }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="cancel()"
        >
          <app-icon [glyph]="xIcon" class="size-4" />
          {{ actionText.cancel }}
        </button>
      </div>
    }
  `,
})
export class DocumentEditorPage implements UnsavedChangesAware, FieldAttempt {
  protected readonly externalLinkIcon = externalLinkIcon;
  protected readonly fileTextIcon = fileTextIcon;
  protected readonly saveIcon = saveIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly uploadIcon = uploadIcon;
  protected readonly xIcon = xIcon;
  private readonly service = inject(DocumentsService);
  private readonly route = inject(ActivatedRoute);
  protected readonly text = inject(ADMIN_TEXT).documents.editor;
  private readonly sizes = inject(SHARED_TEXT).fileSize;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly accept = ACCEPTED_DOCUMENT_MIME_TYPES.join(',');

  private readonly idParam = this.route.snapshot.paramMap.get('id');
  protected readonly isNew = this.idParam === null;

  protected readonly loading = signal(true);
  protected readonly showSkeleton = delayedLoading(this.loading);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly file = signal<StoredDocumentFile | null>(null);
  protected readonly products = signal<DocumentProduct[]>([]);
  private readonly model = signal<DocumentDraft>({
    title: '',
    link: '',
    issuedAt: '',
    expiresAt: '',
  });
  protected readonly form = form(
    this.model,
    (document) => {
      filled(document.title, this.text.titleRequired);
      // The file and the link are each optional, never both missing.
      required(document.link, {
        when: () => !this.file(),
        message: this.text.fileOrLinkRequired,
      });
      maxLength(document.link, DOCUMENT_LINK_MAX_LENGTH);
      validate(document.link, ({ value }) => {
        const link = value().trim();
        return !link || isWebLink(link)
          ? undefined
          : { kind: 'link', message: this.text.linkInvalid };
      });
      // The server refuses the pair as well, but a date typed the wrong way
      // round is a slip to answer beside the field rather than a round trip.
      validate(document.expiresAt, ({ value, valueOf }) => {
        const issued = valueOf(document.issuedAt);
        return issued && value() && value() < issued
          ? { kind: 'expiry', message: this.text.expiryBeforeIssue }
          : undefined;
      });
    },
    { name: 'document-editor' },
  );
  /** Read by every field on the page (FIELD_ATTEMPT). */
  readonly attempted = computed(() => submitAttempt(this.form)());
  protected readonly link = computed(() => this.model().link);
  protected readonly linkValid = computed(() => isWebLink(this.link().trim()));

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
      this.sizes,
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
      this.model.set({
        title: document.title,
        link: document.link ?? '',
        issuedAt: document.issuedAt ?? '',
        expiresAt: document.expiresAt ?? '',
      });
      this.file.set(document.file);
      this.products.set(document.products);
      this.original = this.snapshot();
      this.loaded.set(true);
    }
    this.loading.set(false);
  }

  private snapshot(): string {
    const draft = this.model();
    return JSON.stringify({
      ...draft,
      link: draft.link.trim(),
      file: this.file(),
      products: this.products().map((p) => p.slug),
    });
  }

  protected readonly pasteHint = fillText(this.adminText.upload.pasteHint, {
    keys: pasteKeys(),
  });

  protected dropZoneClass(dragging: boolean): string {
    return `${DROP_ZONE} ${dropZoneState(dragging)}`;
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!chosen) return;
    await this.upload(chosen);
  }

  /**
   * The bytes go up on choice, not on save: an upload that fails has to say so
   * while the admin is still looking at the file picker, and the save that
   * follows is then a plain JSON write like every other record's.
   */
  protected async upload(chosen: File): Promise<void> {
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
    submitAttempt(this.form).set(true);
    if (this.form().invalid()) {
      this.form().errorSummary()[0]?.fieldTree().focusBoundControl();
      return;
    }
    const stored = this.file();
    const draft = this.model();
    const link = draft.link.trim() || null;
    const issuedAt = draft.issuedAt || null;
    const expiresAt = draft.expiresAt || null;

    const body: DocumentInput = {
      title: draft.title.trim(),
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
