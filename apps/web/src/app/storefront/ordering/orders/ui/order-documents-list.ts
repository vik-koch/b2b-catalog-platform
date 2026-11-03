import { Component, computed, inject, input } from '@angular/core';
import {
  OrderDocument,
  orderDocumentPath,
} from '@b2b-catalog-platform/shared/core/ordering';
import { STOREFRONT_TEXT } from '../../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../../shared/config/shared-text';
import { AcceptedDocumentMime } from '@b2b-catalog-platform/shared/platform';
import {
  documentFileCaption,
  documentFileLabel,
} from '../../../../shared/core/document-file';
import { DocumentLink } from '@b2b-catalog-platform/ui/content/document-link';
import { fileTextIcon } from '@b2b-catalog-platform/ui/icons/glyphs/file-text';
import { Card } from '@b2b-catalog-platform/ui/content/card';

/** What a customer can open on their order (FR-ORD-05, FR-ACC-02), by
 * account or by mailed token. */
@Component({
  selector: 'app-order-documents-list',
  imports: [Card, DocumentLink],
  host: { class: 'block' },
  template: `
    <section uiCard>
      <h2 class="font-medium">{{ text.heading }}</h2>
      <ul class="mt-1 divide-y divide-edge text-sm">
        @for (document of rows(); track document.kind) {
          <li>
            <a
              uiDocumentLink
              [href]="document.href"
              [glyph]="fileTextIcon"
              [caption]="document.caption"
            >
              {{ document.label }}
            </a>
          </li>
        }
      </ul>
    </section>
  `,
})
export class OrderDocumentsList {
  protected readonly fileTextIcon = fileTextIcon;
  protected readonly text = inject(STOREFRONT_TEXT).orders.detail.documents;
  private readonly sizes = inject(SHARED_TEXT).fileSize;

  readonly documents = input.required<readonly OrderDocument[]>();
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

  /** "PDF · 240 kB"; a generated summary has no size until drawn. */
  private caption(document: OrderDocument): string {
    const contentType = document.contentType as AcceptedDocumentMime;
    return document.byteSize === null
      ? documentFileLabel(contentType)
      : documentFileCaption(
          { contentType, byteSize: document.byteSize },
          this.sizes,
        );
  }
}
