import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText, ProductDocument } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { ConfirmService } from '../../ui/confirm.service';
import { IconButton } from '../../ui/icon-button';
import { Link } from '../../ui/link';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { AdminGrid } from '../grid/admin-grid';
import { GridColumn } from '../grid/grid-column';
import { GridCardTemplate, GridRowTemplate } from '../grid/grid-templates';
import { GridTimestamp } from '../grid/grid-timestamp';
import { AdminListHeader } from '../list-header';
import { RecordRow } from '../records/record-row';
import { injectEditorReturnParams } from '../editor-return';
import { DocumentsService } from './documents.service';
import { documentFileLabel, documentFileSize } from '../../core/document-file';

/**
 * The document list (FR-DOC-01) — every certificate, declaration and data
 * sheet the shop holds, soonest expiry first, which is the order the one
 * recurring question is asked in ("what is about to run out").
 *
 * Unpaged and searched in the browser: this is a few dozen rows, so a
 * server-side query per keystroke would be machinery for a list that fits in
 * one fetch. The search box still writes the URL like every other grid, so a
 * narrowed list is shareable and the back button behaves.
 */
@Component({
  selector: 'app-document-list-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    Button,
    IconButton,
    AdminIcon,
    Link,
    AdminListHeader,
    AdminGrid,
    GridRowTemplate,
    GridCardTemplate,
    GridTimestamp,
    RecordRow,
    Skeleton,
  ],
  template: `
    <app-admin-list-header
      [title]="text.title"
      [query]="term()"
      [searchLabel]="text.searchLabel"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
      [narrowBelow]="narrowBelow"
    >
      <a
        appButton
        class="gap-2"
        routerLink="/admin/documents/new"
        [queryParams]="editorFrom()"
      >
        <app-admin-icon name="plus" class="h-4 w-4" />
        {{ text.add }}
      </a>
    </app-admin-list-header>

    <p class="mb-6 max-w-3xl text-sm text-muted">{{ text.intro }}</p>

    @if (pageError()) {
      <p class="mb-4 text-sm text-red-700" role="alert">{{ pageError() }}</p>
    }

    @if (documents.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
    } @else if (rows(); as data) {
      <app-admin-grid
        gridId="documents"
        [columns]="columns"
        [rows]="data"
        [trackBy]="byId"
        [busy]="documents.isLoading()"
        [filtered]="filtered()"
        [narrowBelow]="narrowBelow"
        [emptyMessage]="filtered() ? text.noResults : text.empty"
      >
        <ng-template appGridRow [of]="data" let-document>
          <td
            class="truncate font-medium text-stone-700"
            [title]="document.title"
          >
            {{ document.title }}
          </td>
          <!-- What the file is, not what it is called: the stored name is a
               content hash, and the name it was uploaded under is the second
               line because it is what an admin recognises it by. -->
          <td class="truncate text-subtle" [title]="document.file.name">
            <span class="block truncate">{{ fileLabel(document) }}</span>
            <span class="block truncate text-xs">{{ document.file.name }}</span>
          </td>
          <!-- The count is the way into the product grid narrowed to exactly
               these rows — the tier list's price count, said in words. -->
          <td class="truncate">
            <ng-container
              [ngTemplateOutlet]="productLink"
              [ngTemplateOutletContext]="{ $implicit: document }"
            />
          </td>
          <td class="text-subtle">{{ day(document.issuedAt) }}</td>
          <td class="text-subtle">
            {{ day(document.expiresAt) || text.noExpiry }}
          </td>
          <td class="text-subtle">
            <app-grid-timestamp [value]="document.updatedAt" />
          </td>
          <td>
            <div class="flex items-center justify-end gap-2 sm:gap-1">
              <ng-container
                [ngTemplateOutlet]="actions"
                [ngTemplateOutletContext]="{ $implicit: document }"
              />
            </div>
          </td>
        </ng-template>

        <!-- The same document on a phone: what it is called, then the file and
             the date it comes due — the pair the list is scanned for. -->
        <ng-template appGridCard [of]="data" let-document>
          <app-record-row>
            <span class="truncate font-medium text-stone-700">{{
              document.title
            }}</span>
            <div recordBody>
              <p class="mt-1 truncate text-sm text-subtle">
                {{ fileLabel(document) }} · {{ document.file.name }}
              </p>
              <p class="mt-1 truncate text-sm">
                <ng-container
                  [ngTemplateOutlet]="productLink"
                  [ngTemplateOutletContext]="{ $implicit: document }"
                />
              </p>
            </div>
            <span recordMeta class="truncate">
              {{
                day(document.expiresAt) ? expiresLabel(document) : text.noExpiry
              }}
            </span>
            <div
              recordActions
              class="flex items-center justify-end gap-2 sm:gap-1"
            >
              <ng-container
                [ngTemplateOutlet]="actions"
                [ngTemplateOutletContext]="{ $implicit: document }"
              />
            </div>
          </app-record-row>
        </ng-template>
      </app-admin-grid>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }

    <!-- How many products show this document, and the way to see which. Dead
         text at zero: there is nothing for the grid to show. -->
    <ng-template #productLink let-document>
      @if (document.productCount) {
        <a
          appLink
          routerLink="/admin/products"
          [queryParams]="{ documentId: document.id }"
          [title]="text.seeProducts"
        >
          {{ productCount(document) }}
        </a>
      } @else {
        <span class="text-subtle">{{ text.noProducts }}</span>
      }
    </ng-template>

    <!-- One set of buttons for both shapes: opening the file, editing the row,
         deleting it. -->
    <ng-template #actions let-document>
      <a
        appIconButton
        [href]="document.file.url"
        target="_blank"
        rel="noopener"
        [attr.aria-label]="text.open"
        [title]="text.open"
      >
        <app-admin-icon name="external-link" />
      </a>
      <a
        appIconButton
        [routerLink]="['/admin/documents', document.id, 'edit']"
        [queryParams]="editorFrom()"
        [attr.aria-label]="text.edit"
        [title]="text.edit"
      >
        <app-admin-icon name="pencil" />
      </a>
      <button
        type="button"
        appIconButton
        [attr.aria-label]="text.delete"
        [title]="text.delete"
        (click)="remove(document)"
      >
        <app-admin-icon name="trash-2" />
      </button>
    </ng-template>
  `,
})
export class DocumentListPage {
  private readonly service = inject(DocumentsService);
  private readonly confirm = inject(ConfirmService);
  protected readonly text = inject(ADMIN_TEXT).documentList;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly narrowBelow = 'md' as const;
  protected readonly editorFrom = injectEditorReturnParams();

  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;
  private readonly dayFormat = new Intl.DateTimeFormat(this.locale, {
    dateStyle: 'medium',
  });

  /**
   * The search box's parameter, bound from the URL like every other grid. An
   * absent query parameter arrives as `undefined`, not as the default here, so
   * every read of it goes through `term`.
   */
  readonly searchTerm = input('');
  protected readonly term = computed(() => this.searchTerm()?.trim() ?? '');
  protected readonly filtered = computed(() => !!this.term());

  protected readonly documents = resource({
    loader: () => this.service.list(),
  });
  protected readonly showSkeleton = delayedLoading(this.documents.isLoading);

  /** Narrowed here rather than by the API: the whole list is already loaded,
   * and a title and a file name are what somebody looking for one would type. */
  protected readonly rows = computed(() => {
    const all = this.documents.value();
    if (!all) return undefined;
    const term = this.term().toLocaleLowerCase(this.locale);
    if (!term) return all;
    return all.filter(
      (document) =>
        document.title.toLocaleLowerCase(this.locale).includes(term) ||
        document.file.name.toLocaleLowerCase(this.locale).includes(term),
    );
  });

  protected readonly columns: GridColumn[] = [
    { key: 'title', label: this.text.titleColumn, minWidth: 160 },
    { key: 'file', label: this.text.fileColumn, minWidth: 140 },
    { key: 'products', label: this.text.productsColumn, minWidth: 120 },
    { key: 'issued', label: this.text.issuedColumn, minWidth: 96 },
    { key: 'expires', label: this.text.expiresColumn, minWidth: 96 },
    { key: 'updated', label: this.text.updatedColumn, minWidth: 96 },
    { key: 'actions', srLabel: this.common.edit, fixedWidth: 108 },
  ];

  protected readonly byId = (document: ProductDocument): string => document.id;

  /** For the one action that is not a navigation. */
  protected readonly pageError = signal<string | null>(null);

  protected productCount(document: ProductDocument): string {
    return fillText(this.text.products, { count: document.productCount });
  }

  protected fileLabel(document: ProductDocument): string {
    return `${documentFileLabel(document.file.contentType)} · ${documentFileSize(
      document.file.byteSize,
      this.text,
    )}`;
  }

  /** An ISO day in the deployment's locale; empty for a date that is not set. */
  protected day(value: string | null): string {
    return value ? this.dayFormat.format(new Date(value)) : '';
  }

  protected expiresLabel(document: ProductDocument): string {
    return `${this.text.expiresColumn}: ${this.day(document.expiresAt)}`;
  }

  protected async remove(document: ProductDocument): Promise<void> {
    this.pageError.set(null);
    const ok = await this.confirm.ask({
      heading: this.text.deleteTitle,
      message: fillText(this.text.deleteConfirm, { name: document.title }),
      confirmLabel: this.text.delete,
      cancelLabel: this.common.cancel,
      confirmVariant: 'danger',
    });
    if (!ok) return;

    try {
      const result = await this.service.remove(document.id);
      if (!result.ok) {
        this.pageError.set(this.text.deleteError);
        return;
      }
      this.documents.reload();
    } catch {
      this.pageError.set(this.text.deleteError);
    }
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }
}
