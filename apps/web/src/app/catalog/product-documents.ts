import { Component, computed, inject, input } from '@angular/core';
import { fillText, PublicDocument } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import {
  documentFileLabel,
  documentFileSize,
  documentLinkHost,
} from '../core/document-file';
import { Icon, IconName } from '../ui/icons/icon';

/** One row as the template draws it: where the title leads, and — for a
 * document with both a file and a link — the link as a second way in. */
interface DocumentRow {
  title: string;
  href: string;
  glyph: IconName;
  caption: string;
  link: { href: string; host: string; label: string } | null;
}

/**
 * The documents on a product page (FR-DOC-03/05) — the certificates and data
 * sheets a buyer asks for before ordering, each a link that opens the file or
 * the page it is held on elsewhere, such as a register entry.
 *
 * A list of titles rather than page previews. A preview would have to be
 * rendered: on the client that is a PDF engine in the storefront bundle, on
 * the server a native renderer, a thumbnail store and a backfill — and what it
 * would show is the top of a scanned page, which is a grey rectangle at that
 * size. The title is what the buyer is looking for, and the line under it says
 * what pressing it gets: the format and size of a file, the site a link leads
 * to.
 *
 * Nothing about expiry is said here: an expired document is not in this list
 * at all (the API drops it), so there is no state for a customer to read.
 */
@Component({
  selector: 'app-product-documents',
  imports: [Icon],
  template: `
    <ul class="mt-3 divide-y divide-border border-t border-border text-sm">
      @for (row of rows(); track $index) {
        <li>
          @if (row.link; as link) {
            <!-- A file and a link: two places to go, so two anchors — the
                 title opens the file, the site under it the entry. -->
            <div class="flex items-start gap-3 py-2.5">
              <app-icon
                [name]="row.glyph"
                class="mt-0.5 size-4 shrink-0 text-subtle"
              />
              <span class="min-w-0">
                <a
                  [href]="row.href"
                  target="_blank"
                  rel="noopener"
                  [attr.aria-describedby]="hintId"
                  class="block font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:text-accent hover:decoration-accent"
                >
                  {{ row.title }}
                </a>
                <span class="block text-xs text-subtle">
                  {{ row.caption }} ·
                  <a
                    [href]="link.href"
                    target="_blank"
                    rel="noopener"
                    [attr.aria-label]="link.label"
                    [attr.aria-describedby]="hintId"
                    class="inline-flex items-center gap-1 underline decoration-subtle/40 underline-offset-2 hover:text-accent hover:decoration-accent"
                    >{{ link.host
                    }}<app-icon name="external-link" class="size-3 shrink-0"
                  /></a>
                </span>
              </span>
            </div>
          } @else {
            <!-- The whole row is the link, glyph and caption included: they
                 are one thing to press, which is what a finger on a phone is
                 aiming at. -->
            <a
              [href]="row.href"
              target="_blank"
              rel="noopener"
              [attr.aria-describedby]="hintId"
              class="group flex items-start gap-3 py-2.5"
            >
              <app-icon
                [name]="row.glyph"
                class="mt-0.5 size-4 shrink-0 text-subtle"
              />
              <span class="min-w-0">
                <span
                  class="block font-medium text-primary underline decoration-primary/30 underline-offset-2 group-hover:text-accent group-hover:decoration-accent"
                >
                  {{ row.title }}
                </span>
                <span class="block text-xs text-subtle">
                  {{ row.caption }}
                </span>
              </span>
            </a>
          }
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

  protected readonly rows = computed(() =>
    this.documents().flatMap((document) => this.row(document) ?? []),
  );

  private row({ title, file, link }: PublicDocument): DocumentRow | null {
    const host = link ? documentLinkHost(link) : '';
    if (file) {
      return {
        title,
        href: file.url,
        glyph: 'file-text',
        // What the file is and what it weighs — "PDF · 240 kB".
        caption: `${documentFileLabel(file.contentType)} · ${documentFileSize(
          file.byteSize,
          this.text,
        )}`,
        link: link
          ? { href: link, host, label: fillText(this.text.linkLabel, { host }) }
          : null,
      };
    }
    if (link) {
      return {
        title,
        href: link,
        glyph: 'external-link',
        caption: host,
        link: null,
      };
    }
    return null;
  }
}
