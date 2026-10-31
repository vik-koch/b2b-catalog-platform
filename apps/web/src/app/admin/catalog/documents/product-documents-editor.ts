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
import { LinkedDocument } from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { adminDayFormat } from '../../dates/admin-date';
import { HighlightedLine } from '@b2b-catalog-platform/ui/suggest/highlighted-line';
import { MatchSegmentsPipe } from '../../../core/catalog/search/match-segments.pipe';
import { AlternateLayout } from '../../../shared/core/alternate-layout';
import { SuggestList } from '@b2b-catalog-platform/ui/suggest/suggest-list';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { PRODUCT_FEATURE_GLYPHS } from '../products/product-feature-glyphs';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { SuggestField } from '@b2b-catalog-platform/ui/suggest/suggest-field';
import { SuggestInput } from '@b2b-catalog-platform/ui/suggest/suggest-input';
import { SuggestRow } from '@b2b-catalog-platform/ui/suggest/suggest-row';
import { DocumentsService } from './documents.service';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { SubEditorFrame } from '../ui/sub-editor-frame';

/** `aria-controls` must name one panel, and a page may hold more than one. */
let nextId = 0;

/** Enough rows to choose from without the panel becoming a listing of its own. */
const SUGGESTIONS_SHOWN = 8;

/**
 * The documents on one product (FR-DOC-02), added one at a time like pairings;
 * the document's own screen links in bulk. Both send the whole set from their
 * side. Suggestions search the whole list, fetched once, in the browser.
 */
@Component({
  selector: 'app-product-documents-editor',
  imports: [
    SubEditorFrame,
    RouterLink,
    Icon,
    FieldLabel,
    HighlightedLine,
    MatchSegmentsPipe,
    IconButton,
    Input,
    Link,
    SuggestField,
    SuggestInput,
    SuggestRow,
  ],
  host: { class: 'block' },
  template: `
    <app-sub-editor-frame
      [label]="product.documents"
      [glyph]="glyph"
      [count]="value().length"
      [countLabel]="countLabel()"
      [hint]="text.hint"
      [(open)]="open"
    >
      @if (value().length > 0) {
        <ul class="mt-3 divide-y divide-edge border-y border-edge">
          @for (item of value(); track item.id) {
            <li class="flex items-center gap-2 py-1.5 text-sm">
              <a
                uiLink
                class="min-w-0 flex-1 truncate"
                [routerLink]="['/admin/documents', item.id, 'edit']"
                >{{ item.title }}</a
              >
              <span class="shrink-0 text-xs text-ink-subtle">
                {{ expiry(item) }}
              </span>
              <button
                uiIconButton
                type="button"
                [attr.aria-label]="removeLabel(item)"
                (click)="remove(item.id)"
              >
                <ui-icon [glyph]="xIcon" />
              </button>
            </li>
          }
        </ul>
      }

      <div class="mt-3">
        <label [for]="inputId" uiFieldLabel>{{ text.add }}</label>
        <ui-suggest-field [list]="list" [text]="text" (picked)="add($event)">
          <input
            [id]="inputId"
            autocomplete="off"
            uiInput
            uiSuggestInput
            class="w-full"
            [value]="query()"
            [placeholder]="text.addPlaceholder"
            (input)="query.set($any($event.target).value)"
          />
          <ng-template uiSuggestRow [of]="list" let-item let-query="query">
            <span class="block truncate">
              <ui-highlighted-line
                [segments]="
                  item.title | matchSegments: query : alternateQuery()
                "
              />
            </span>
            <span class="block text-xs text-ink-subtle">
              {{ expiry(item) }}
            </span>
          </ng-template>
        </ui-suggest-field>
      </div>
    </app-sub-editor-frame>
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
  protected readonly inputId = `document-search-${++nextId}`;

  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly dayFormat = adminDayFormat(this.locale);

  /** Projected to what a link carries: files and counts do not belong in a
   * product's save. */
  private readonly documents = resource({
    loader: () =>
      this.service
        .list()
        .then((all) =>
          all.map(({ id, title, expiresAt }) => ({ id, title, expiresAt })),
        )
        .catch(() => []),
  });

  private readonly layout = inject(AlternateLayout);
  protected readonly list = new SuggestList<LinkedDocument>({
    load: async (q) => {
      const found = this.layout.matches(q);
      return (this.documents.value() ?? []).filter((d) => found(d.title));
    },
    minLength: 1,
    shown: (answer) => {
      const taken = new Set(this.value().map((d) => d.id));
      return answer
        .filter((document) => !taken.has(document.id))
        .slice(0, SUGGESTIONS_SHOWN);
    },
  });
  protected readonly alternateQuery = computed(() =>
    this.layout.of(this.list.query()),
  );

  protected readonly countLabel = computed(() =>
    fillText(this.adminText.countSuffix, { count: this.value().length }),
  );

  /** Opens only on load: closing when the last row went would take the field
   * that puts one back with it. */
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
    this.query.set('');
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((d) => d.id !== id));
  }

  protected removeLabel(item: LinkedDocument): string {
    return fillText(this.text.removeAria, { name: item.title });
  }
}
