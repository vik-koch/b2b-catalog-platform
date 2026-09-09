import { Component, computed, inject, input } from '@angular/core';
import { OrderDocument, orderDocumentPath } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { documentFileLabel, documentFileSize } from '../core/document-file';
import { Icon } from '../ui/icons/icon';

/**
 * What a customer can open on their order (FR-ORD-05, FR-ACC-02).
 *
 * The same list on the account's own page and on the page a mailed link
 * opens, differing only in how the reader is entitled to it: a session, or the
 * token the link carries. Which version the summary states follows from that
 * and is never asked for here — the document says what the page around it
 * says.
 *
 * Drawn like the documents on a product page, because they are the same kind
 * of thing to a customer: a row, a glyph, and the format under the name. The
 * generated summary carries no size — it does not exist until it is asked for,
 * and a figure invented for it would be the one number on the page that is not
 * a fact.
 *
 * Nothing is listed that does not exist, so there is no empty state: an order
 * with nothing to open does not draw this at all.
 */
@Component({
  selector: 'app-order-documents-list',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <section class="rounded-lg border border-border p-5">
      <h2 class="font-medium">{{ text.heading }}</h2>
      <ul class="mt-1 divide-y divide-border text-sm">
        @for (document of rows(); track document.kind) {
          <li>
            <!-- The whole row is the link, glyph and caption included: they
                 are one thing to press, which is what a finger on a phone is
                 aiming at. -->
            <a
              [href]="document.href"
              target="_blank"
              rel="noopener"
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
                  {{ document.label }}
                </span>
                <span class="block text-xs text-subtle">{{
                  document.caption
                }}</span>
              </span>
            </a>
          </li>
        }
      </ul>
    </section>
  `,
})
export class OrderDocumentsList {
  protected readonly text = inject(APP_TEXT).orders.detail.documents;
  private readonly sizes = inject(APP_TEXT).catalog.documents;

  readonly documents = input.required<readonly OrderDocument[]>();
  /** How this reader is entitled to the order: their own account, or the
   * token a mailed link carries. */
  readonly by = input.required<{ reference: string } | { token: string }>();

  protected readonly rows = computed(() =>
    this.documents().map((document) => ({
      kind: document.kind,
      label:
        document.kind === 'payment-instructions'
          ? this.text.paymentInstructions
          : this.text.summary,
      caption: this.caption(document),
      href: orderDocumentPath(document.kind, this.by()),
    })),
  );

  /** "PDF · 240 kB" for a file the shop supplied; just the format for the one
   * the shop system draws on demand. */
  private caption(document: OrderDocument): string {
    const format = documentFileLabel(document.contentType as never);
    return document.byteSize === null
      ? format
      : `${format} · ${documentFileSize(document.byteSize, this.sizes)}`;
  }
}
