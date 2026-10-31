import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  AdminProductListItem,
  LinkedProduct,
  PRODUCT_PAIRINGS_MAX,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { HighlightedLine } from '@b2b-catalog-platform/ui/suggest/highlighted-line';
import { MatchSegmentsPipe } from '../../../core/catalog/search/match-segments.pipe';
import { AlternateLayout } from '../../../shared/core/alternate-layout';
import { SuggestList } from '@b2b-catalog-platform/ui/suggest/suggest-list';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { PRODUCT_FEATURE_GLYPHS } from './product-feature-glyphs';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SuggestField } from '@b2b-catalog-platform/ui/suggest/suggest-field';
import { SuggestInput } from '@b2b-catalog-platform/ui/suggest/suggest-input';
import { SuggestRow } from '@b2b-catalog-platform/ui/suggest/suggest-row';
import { ProductsService } from './products.service';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { SubEditorFrame } from '../ui/sub-editor-frame';
import {
  linkedProductState,
  ProductStateBadge,
} from '../ui/product-state-badge';

/** `aria-controls` must name one list, and a page may hold more than one. */
let nextId = 0;

/** Enough rows to choose from without the panel becoming a listing of its own. */
const SUGGESTIONS_SHOWN = 8;

/**
 * The products this one is sold with (FR-SET-01). A deleted or unpublished
 * counterpart stays listed and marked, since both are reversible; it is only
 * not offered as a new one.
 */
@Component({
  selector: 'app-product-pairings-editor',
  imports: [
    ProductStateBadge,
    SubEditorFrame,
    Icon,
    FieldLabel,
    HighlightedLine,
    MatchSegmentsPipe,
    IconButton,
    Input,
    SuggestField,
    SuggestInput,
    SuggestRow,
  ],
  host: { class: 'block' },
  template: `
    <app-sub-editor-frame
      [label]="product.pairings"
      [glyph]="glyph"
      [count]="value().length"
      [countLabel]="countLabel()"
      [hint]="text.hint"
      [(open)]="open"
    >
      @if (value().length > 0) {
        <ul class="mt-3 divide-y divide-edge border-y border-edge">
          @for (item of value(); track item.slug) {
            <li class="flex items-center gap-2 py-1.5 text-sm">
              <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
              <app-product-state-badge [state]="linkedState(item)" />
              <button
                uiIconButton
                type="button"
                [attr.aria-label]="removeLabel(item)"
                (click)="remove(item.slug)"
              >
                <ui-icon [glyph]="xIcon" />
              </button>
            </li>
          }
        </ul>
      }

      @if (value().length >= max) {
        <p class="mt-3 text-xs text-ink-subtle">{{ limitLabel() }}</p>
      } @else {
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
                    item.name | matchSegments: query : alternateQuery()
                  "
                />
              </span>
              @if (item.publishedAt === null) {
                <span class="block text-xs text-ink-subtle">
                  {{ productStates.unpublished }}
                </span>
              }
            </ng-template>
          </ui-suggest-field>
        </div>
      }
    </app-sub-editor-frame>
  `,
})
export class ProductPairingsEditor implements OnInit {
  protected readonly xIcon = xIcon;
  private readonly service = inject(ProductsService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.pairings;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly productStates = inject(ADMIN_TEXT).products;
  protected readonly linkedState = linkedProductState;
  protected readonly glyph = PRODUCT_FEATURE_GLYPHS.pairings;

  readonly value = input.required<readonly LinkedProduct[]>();
  /** Not offered as its own counterpart. Null for a new product, which the
   * search cannot return anyway. */
  readonly ownSlug = input<string | null>(null);

  readonly valueChange = output<LinkedProduct[]>();

  protected readonly max = PRODUCT_PAIRINGS_MAX;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly inputId = `pairing-search-${++nextId}`;

  /** A short query is fine: this searches our own catalog, not a metered
   * provider, and an admin pairing a lid types "lid". */
  protected readonly list = new SuggestList<AdminProductListItem>({
    load: (q) =>
      this.service.list({ q, sort: 'relevance' }).then((r) => r.items),
    minLength: 2,
    /** Filtered here, not in the query: the exclusions are this form's. */
    shown: (answer) => {
      const taken = new Set(this.value().map((p) => p.slug));
      const own = this.ownSlug();
      return answer
        .filter(
          (item) =>
            item.deletedAt === null &&
            item.slug !== own &&
            !taken.has(item.slug),
        )
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

  protected readonly limitLabel = computed(() =>
    fillText(this.text.limit, { count: this.max }),
  );

  /** Opens only on load: closing when the last pairing went would take the
   * field that adds one with it. */
  ngOnInit(): void {
    this.open.set(this.value().length > 0);
  }

  protected add(item: AdminProductListItem): void {
    this.valueChange.emit([
      ...this.value(),
      {
        slug: item.slug,
        name: item.name,
        deleted: false,
        unpublished: item.publishedAt === null,
      },
    ]);
    this.query.set('');
  }

  protected remove(slug: string): void {
    this.valueChange.emit(this.value().filter((p) => p.slug !== slug));
  }

  protected removeLabel(item: LinkedProduct): string {
    return fillText(this.text.removeAria, { name: item.name });
  }
}
