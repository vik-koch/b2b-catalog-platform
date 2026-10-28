import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { LinkedDocument } from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { adminDayFormat } from '../dates/admin-date';
import { HighlightedLine } from '../../shared/ui/highlighted-line';
import { MatchSegmentsPipe } from '../../shared/catalog/match-segments.pipe';
import { AlternateLayout } from '../../shared/core/alternate-layout';
import { SuggestList } from '../../shared/ui/suggest-list';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { PRODUCT_FEATURE_GLYPHS } from '../products/product-feature-glyphs';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { SuggestField } from '../../shared/ui/suggest-field';
import { SuggestInput } from '../../shared/ui/suggest-input';
import { SuggestRow } from '../../shared/ui/suggest-row';
import { DocumentsService } from './documents.service';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** `aria-controls` must name one list, and a page may hold more than one. */
let nextId = 0;

/** Enough rows to choose from without the panel becoming a listing of its own. */
const SUGGESTIONS_SHOWN = 8;

/**
 * The documents shown on one product (FR-DOC-02), in the product's own form —
 * the pairings editor's shape, deliberately, because it is the same job: a
 * short list of things attached to this one record, added one at a time.
 *
 * The other side of the link edits it in bulk (a certificate onto thirty
 * espressos in one pass), and that screen has a picker built for that. This one
 * answers the opposite question — "this product should not carry that
 * certificate" — which is one row, here, where the admin already is.
 *
 * Both write the same table and both send the whole set from their own side,
 * exactly as two products' pairing editors do.
 *
 * The suggestions come from the whole document list, which is a few dozen rows
 * fetched once; the search is over titles in the browser.
 */
@Component({
  selector: 'app-product-documents-editor',
  imports: [
    RouterLink,
    Icon,
    DisclosureToggle,
    FieldLabel,
    HighlightedLine,
    MatchSegmentsPipe,
    IconButton,
    Input,
    Link,
    SuggestField,
    SuggestInput,
    SuggestRow,
    DisclosureFrame,
  ],
  host: { class: 'block' },
  template: `
    <div class="max-w-xl rounded-md border" appDisclosureFrame [open]="open()">
      <app-disclosure-toggle
        [label]="product.documents"
        [count]="value().length"
        [countLabel]="countLabel()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      >
        <app-icon
          disclosureLead
          [glyph]="glyph"
          class="size-4 text-ink-subtle"
        />
      </app-disclosure-toggle>
      @if (open()) {
        <div [id]="panelId" class="border-t border-edge p-4">
          <p class="text-xs text-ink-subtle">{{ text.hint }}</p>

          @if (value().length > 0) {
            <ul class="mt-3 divide-y divide-edge border-y border-edge">
              @for (item of value(); track item.id) {
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <!-- The title goes to the document itself, which is where the
                       file, the dates and every other product on it live. -->
                  <a
                    appLink
                    class="min-w-0 flex-1 truncate"
                    [routerLink]="['/admin/documents', item.id, 'edit']"
                    >{{ item.title }}</a
                  >
                  <span class="shrink-0 text-xs text-ink-subtle">
                    {{ expiry(item) }}
                  </span>
                  <button
                    appIconButton
                    type="button"
                    [attr.aria-label]="removeLabel(item)"
                    (click)="remove(item.id)"
                  >
                    <app-icon [glyph]="xIcon" />
                  </button>
                </li>
              }
            </ul>
          }

          <div class="mt-3">
            <label [for]="inputId" appFieldLabel>{{ text.add }}</label>
            <app-suggest-field
              [list]="list"
              [text]="text"
              (picked)="add($event)"
            >
              <input
                [id]="inputId"
                autocomplete="off"
                appInput
                appSuggestInput
                class="w-full"
                [value]="query()"
                [placeholder]="text.addPlaceholder"
                (input)="query.set($any($event.target).value)"
              />
              <ng-template appSuggestRow [of]="list" let-item let-query="query">
                <span class="block truncate">
                  <app-highlighted-line
                    [segments]="
                      item.title | matchSegments: query : alternateQuery()
                    "
                  />
                </span>
                <span class="block text-xs text-ink-subtle">
                  {{ expiry(item) }}
                </span>
              </ng-template>
            </app-suggest-field>
          </div>
        </div>
      }
    </div>
  `,
})
export class ProductDocumentsEditor implements OnInit {
  protected readonly xIcon = xIcon;
  private readonly service = inject(DocumentsService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.documents;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly glyph = PRODUCT_FEATURE_GLYPHS.documents;

  readonly value = input.required<readonly LinkedDocument[]>();
  readonly valueChange = output<LinkedDocument[]>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly panelId = `documents-panel-${++nextId}`;
  protected readonly inputId = `document-search-${nextId}`;

  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly dayFormat = adminDayFormat(this.locale);

  /**
   * The whole document list, fetched once and searched here: there are a few
   * dozen of them, and a title is short enough that a substring match is a
   * better answer than the catalog's typo-tolerant matcher would be.
   */
  private readonly documents = resource({
    // Projected to what a link carries: the row the list endpoint returns knows
    // about files and counts, and none of that belongs in a product's save.
    loader: () =>
      this.service
        .list()
        .then((all) =>
          all.map(({ id, title, expiresAt }) => ({ id, title, expiresAt })),
        )
        .catch(() => []),
  });

  protected readonly list = new SuggestList<LinkedDocument>({
    load: async (q) => {
      const terms = this.layout
        .readings(q.trim())
        .map((term) => term.toLocaleLowerCase(this.locale));
      return (this.documents.value() ?? []).filter((document) => {
        const title = document.title.toLocaleLowerCase(this.locale);
        return terms.some((term) => title.includes(term));
      });
    },
    minLength: 1,
    /** What is offerable: everything not already on this product. */
    shown: (answer) => {
      const taken = new Set(this.value().map((d) => d.id));
      return answer
        .filter((document) => !taken.has(document.id))
        .slice(0, SUGGESTIONS_SHOWN);
    },
  });
  private readonly layout = inject(AlternateLayout);
  protected readonly alternateQuery = computed(() =>
    this.layout.of(this.list.query()),
  );

  protected readonly countLabel = computed(() =>
    fillText(this.adminText.countSuffix, { count: this.value().length }),
  );

  /** Open where there is something to see — the pairings editor's rule, for
   * the same reason: a panel that closed itself when the last row went would
   * take the field that puts one back with it. */
  ngOnInit(): void {
    this.open.set(this.value().length > 0);
  }

  protected expiry(document: LinkedDocument): string {
    return document.expiresAt
      ? fillText(this.text.expires, {
          date: this.dayFormat.format(new Date(document.expiresAt)),
        })
      : this.text.noExpiry;
  }

  protected add(item: LinkedDocument): void {
    this.valueChange.emit([...this.value(), item]);
    // The field empties on a pick: the next one is a different search.
    this.query.set('');
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((d) => d.id !== id));
  }

  protected removeLabel(item: LinkedDocument): string {
    return fillText(this.text.removeAria, { name: item.title });
  }
}
