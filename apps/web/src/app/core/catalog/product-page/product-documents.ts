import { Component, computed, inject, input } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { PublicDocument } from '@b2b-catalog-platform/shared/core/catalog';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import {
  documentFileCaption,
  documentLinkHost,
} from '../../../shared/core/document-file';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { externalLinkIcon } from '@b2b-catalog-platform/ui/icons/glyphs/external-link';
import { fileTextIcon } from '@b2b-catalog-platform/ui/icons/glyphs/file-text';

/** With both a file and a link, the link is a second way in. */
interface DocumentRow {
  title: string;
  href: string;
  glyph: Glyph;
  caption: string;
  link: { href: string; host: string; ariaLabel: string } | null;
}

/**
 * A product's documents (FR-DOC-03/05), as titles with what pressing one gets:
 * a file's format and size, or the site a link leads to. No previews: they
 * would need a PDF renderer and show a grey scan. The API drops expired ones.
 */
@Component({
  selector: 'app-product-documents',
  imports: [Icon],
  template: `
    <ul class="mt-3 divide-y divide-edge border-t border-edge text-sm">
      @for (row of rows(); track $index) {
        <li>
          @if (row.link; as link) {
            <!-- Two anchors: the title opens the file, the site the entry. -->
            <div class="flex items-start gap-3 py-2.5">
              <ui-icon
                [glyph]="row.glyph"
                class="mt-0.5 size-4 shrink-0 text-ink-subtle"
              />
              <span class="min-w-0">
                <a
                  [href]="row.href"
                  target="_blank"
                  rel="noopener"
                  [attr.aria-describedby]="hintId"
                  class="block font-medium text-primary underline
                         decoration-primary/30 underline-offset-2
                         hover:text-accent hover:decoration-accent"
                >
                  {{ row.title }}
                </a>
                <span class="block text-xs text-ink-subtle">
                  {{ row.caption }} ·
                  <a
                    [href]="link.href"
                    target="_blank"
                    rel="noopener"
                    [attr.aria-label]="link.ariaLabel"
                    [attr.aria-describedby]="hintId"
                    class="inline-flex items-center gap-1 underline
                           decoration-ink-subtle/40 underline-offset-2
                           hover:text-accent hover:decoration-accent"
                    >{{ link.host
                    }}<ui-icon
                      [glyph]="externalLinkIcon"
                      class="size-3 shrink-0"
                  /></a>
                </span>
              </span>
            </div>
          } @else {
            <!-- The whole row is one thing to press. -->
            <a
              [href]="row.href"
              target="_blank"
              rel="noopener"
              [attr.aria-describedby]="hintId"
              class="group flex items-start gap-3 py-2.5"
            >
              <ui-icon
                [glyph]="row.glyph"
                class="mt-0.5 size-4 shrink-0 text-ink-subtle"
              />
              <span class="min-w-0">
                <span
                  class="block font-medium text-primary underline
                         decoration-primary/30 underline-offset-2
                         group-hover:text-accent group-hover:decoration-accent"
                >
                  {{ row.title }}
                </span>
                <span class="block text-xs text-ink-subtle">
                  {{ row.caption }}
                </span>
              </span>
            </a>
          }
        </li>
      }
    </ul>
    <!-- Said once and pointed at by every link. -->

    <p [id]="hintId" class="sr-only">{{ text.hintAria }}</p>
  `,
})
export class ProductDocuments {
  protected readonly externalLinkIcon = externalLinkIcon;
  protected readonly text = inject(STOREFRONT_TEXT).catalog.documents;
  private readonly sizes = inject(SHARED_TEXT).fileSize;
  protected readonly hintId = 'product-documents-hint';

  readonly documents = input.required<readonly PublicDocument[]>();

  protected readonly rows = computed(() =>
    this.documents().flatMap((document) => this.row(document) ?? []),
  );

  private row({ title, file, link }: PublicDocument): DocumentRow | null {
    const host = link ? documentLinkHost(link) : '';
    if (file) {
      return {
        title,
        href: file.url,
        glyph: fileTextIcon,
        caption: documentFileCaption(file, this.sizes),
        link: link
          ? {
              href: link,
              host,
              ariaLabel: fillText(this.text.linkAria, { host }),
            }
          : null,
      };
    }
    if (link) {
      return {
        title,
        href: link,
        glyph: externalLinkIcon,
        caption: host,
        link: null,
      };
    }
    return null;
  }
}
