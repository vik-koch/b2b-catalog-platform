import { Component, inject, input } from '@angular/core';
import { PublicDocument } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { documentFileLabel, documentFileSize } from '../core/document-file';
import { Icon } from '../ui/icons/icon';

/**
 * The documents on a product page (FR-DOC-03) — the certificates and data
 * sheets a buyer asks for before ordering, each a link that opens the file.
 *
 * A list of titles rather than page previews. A preview would have to be
 * rendered: on the client that is a PDF engine in the storefront bundle, on
 * the server a native renderer, a thumbnail store and a backfill — and what it
 * would show is the top of a scanned page, which is a grey rectangle at that
 * size. The title is what the buyer is looking for, and the format and size
 * under it say what pressing it costs, which is the honest part of a preview.
 *
 * Nothing about expiry is said here: an expired document is not in this list
 * at all (the API drops it), so there is no state for a customer to read.
 */
@Component({
  selector: 'app-product-documents',
  imports: [Icon],
  template: `
    <ul class="mt-3 divide-y divide-border border-t border-border text-sm">
      @for (document of documents(); track document.url) {
        <li>
          <!-- The whole row is the link, glyph and caption included: they are
               one thing to press, which is what a finger on a phone is
               aiming at. -->
          <a
            [href]="document.url"
            target="_blank"
            rel="noopener"
            [attr.aria-describedby]="hintId"
            class="group flex items-start gap-3 py-2.5"
          >
            <app-icon
              name="file-text"
              class="mt-0.5 h-4 w-4 shrink-0 text-subtle"
            />
            <span class="min-w-0">
              <span
                class="block font-medium text-primary underline decoration-primary/30 underline-offset-2 group-hover:text-accent group-hover:decoration-accent"
              >
                {{ document.title }}
              </span>
              <span class="block text-xs text-subtle">
                {{ caption(document) }}
              </span>
            </span>
          </a>
        </li>
      }
    </ul>
    <!-- Said once and pointed at by every link, rather than repeated into each
         one's accessible name: it is the same promise for all of them. -->
    <p [id]="hintId" class="sr-only">{{ text.hint }}</p>
  `,
})
export class ProductDocuments {
  protected readonly text = inject(APP_TEXT).catalog.documents;
  protected readonly hintId = 'product-documents-hint';

  readonly documents = input.required<readonly PublicDocument[]>();

  /** What the file is and what it weighs — "PDF · 240 kB". */
  protected caption(document: PublicDocument): string {
    return `${documentFileLabel(document.contentType)} · ${documentFileSize(
      document.byteSize,
      this.text,
    )}`;
  }
}
