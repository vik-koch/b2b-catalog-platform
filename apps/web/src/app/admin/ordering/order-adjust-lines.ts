import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  moneyFormat,
  currencySymbol,
} from '@b2b-catalog-platform/shared/platform';
import { AdjustmentLineFlag } from '@b2b-catalog-platform/shared/core/ordering';
import { AdminProductListItem } from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { partialPriceRule } from '../../core/catalog/pricing/price';
import { Suggestion } from '@b2b-catalog-platform/ui/suggest/suggestion';
import { MatchSegmentsPipe } from '../../core/catalog/search/match-segments.pipe';
import { AlternateLayout } from '../../shared/core/alternate-layout';
import { SuggestList } from '@b2b-catalog-platform/ui/suggest/suggest-list';
import { ProductsService } from '../catalog/products/products.service';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { Allow } from '@b2b-catalog-platform/ui/inputs/allow';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { SuggestField } from '@b2b-catalog-platform/ui/suggest/suggest-field';
import { SuggestInput } from '@b2b-catalog-platform/ui/suggest/suggest-input';
import { SuggestRow } from '@b2b-catalog-platform/ui/suggest/suggest-row';
import { UnitInput } from '@b2b-catalog-platform/ui/inputs/unit-input';
import { UnitInputControl } from '@b2b-catalog-platform/ui/inputs/unit-input-control';
import { chevronDownIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-down';
import { chevronUpIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-up';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** `aria-controls` must name one list, and a page may hold more than one. */
let nextId = 0;

/** Enough to choose from without becoming a listing. */
const SUGGESTIONS_SHOWN = 8;

/** One line as this editor holds it: what is sent, plus how it reads. */
export interface AdjustLineRow {
  slug: string;
  name: string;
  /** Stable, so a row and its cursor survive reordering and removal. */
  key: string;
  /** Pieces: the staff reading. */
  pieces: number;
  /** One piece's price as typed; empty only until the server fills the list's
   * price. */
  priceText: string;
  /** The customer's reading and note, carried, not edited. */
  quantityLabel: string;
  note: string | null;
  totalLabel: string;
  /** The rate the new version states (NFR-LEGAL-11), or empty. */
  taxLabel: string;
  flags: readonly AdjustmentLineFlag[];
  /** Priced off its list (FR-CART-09): marked here and counted above the save,
   * the screen's one silent mistake. */
  offList: boolean;
}

/** The lines of an order being adjusted (FR-ORD-03), in **pieces**, as staff
 * and the source system read them; the customer's reading sits beside. Figures
 * are the server's answer. */
@Component({
  selector: 'app-order-adjust-lines',
  imports: [
    Icon,
    FieldLabel,
    Suggestion,
    MatchSegmentsPipe,
    IconButton,
    Input,
    Allow,
    Skeleton,
    StatusBadge,
    SuggestField,
    SuggestInput,
    SuggestRow,
    UnitInput,
    UnitInputControl,
  ],
  host: { class: 'block' },
  template: `
    <ul class="divide-y divide-edge border-b border-edge">
      @for (line of lines(); track line.key; let i = $index) {
        <li class="py-2 first:pt-0">
          <!-- The name gets the row: long names are ordinary. -->
          <span class="block">{{ line.name }}</span>
          @if (line.note) {
            <span class="block text-sm text-ink-subtle italic">{{
              line.note
            }}</span>
          }

          <!-- Everything else on one row. The fields wear their units, so no
               captions: a forty-line form is read by scrolling. -->
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <ui-unit-input class="w-28" [unit]="pieceUnit">
              <input
                uiUnitInputControl
                type="number"
                min="1"
                step="1"
                [id]="id + '-pieces-' + i"
                [attr.aria-label]="text.unitsAria"
                [disabled]="disabled()"
                [value]="line.pieces"
                (input)="piecesTyped(i, $any($event.target).value)"
              />
            </ui-unit-input>
            <ui-unit-input class="w-28" [unit]="priceSuffix()">
              <input
                [uiAllow]="partialPrice"
                uiUnitInputControl
                type="text"
                inputmode="decimal"
                [id]="id + '-price-' + i"
                [attr.aria-label]="text.priceAria"
                [disabled]="disabled()"
                [value]="line.priceText"
                (input)="priceTyped(i, $any($event.target).value)"
              />
            </ui-unit-input>
            @if (line.offList) {
              <span uiStatusBadge tone="info">{{ text.offList }}</span>
            }
            @for (flag of line.flags; track flag) {
              <span uiStatusBadge [tone]="tone(flag)">
                {{ flagLabel(flag) }}
              </span>
            }

            <span class="ml-auto flex shrink-0 items-center gap-3">
              <!-- The customer's reading over the line total: the server's
                   answer to the fields, ending their row. Bars until it
                   arrives, so the row does not grow. -->
              <span class="text-right">
                @if (line.totalLabel) {
                  <span class="block text-sm text-ink-subtle">
                    {{ line.quantityLabel }}
                  </span>
                  <!-- The rate on the total's line, so the row keeps the two
                       lines its bars hold. -->
                  <span class="block">
                    @if (line.taxLabel) {
                      <span class="mr-1.5 text-xs text-ink-subtle">
                        {{ line.taxLabel }}
                      </span>
                    }
                    {{ line.totalLabel }}
                  </span>
                } @else {
                  <!-- Bars shaped like the two lines, right-aligned. -->
                  <span class="block w-20">
                    <ui-skeleton
                      size="sm"
                      align="right"
                      [widths]="['4.5rem']"
                    />
                    <ui-skeleton
                      size="base"
                      align="right"
                      [widths]="['3.25rem']"
                    />
                  </span>
                }
              </span>
              <!-- Reordering is not a change, but spares delete-and-re-add,
                   which loses the price. -->
              <span class="flex shrink-0 items-center">
                <button
                  uiIconButton
                  type="button"
                  [disabled]="disabled() || i === 0"
                  [attr.aria-label]="moveLabel(line, text.moveUpAria)"
                  (click)="moved.emit({ from: i, to: i - 1 })"
                >
                  <ui-icon [glyph]="chevronUpIcon" />
                </button>
                <button
                  uiIconButton
                  type="button"
                  [disabled]="disabled() || i === lines().length - 1"
                  [attr.aria-label]="moveLabel(line, text.moveDownAria)"
                  (click)="moved.emit({ from: i, to: i + 1 })"
                >
                  <ui-icon [glyph]="chevronDownIcon" />
                </button>
                <button
                  uiIconButton
                  type="button"
                  [disabled]="disabled()"
                  [attr.aria-label]="removeLabel(line)"
                  (click)="removed.emit(i)"
                >
                  <ui-icon [glyph]="xIcon" />
                </button>
              </span>
            </span>
          </div>
        </li>
      } @empty {
        <li class="py-3 text-sm text-ink-subtle">{{ text.empty }}</li>
      }
    </ul>

    <!-- The whole catalog, published or not: an order may be filled from
         anything. -->
    <div class="mt-4">
      <label [for]="id + '-add'" uiFieldLabel>{{ text.addLabel }}</label>
      <ui-suggest-field
        [list]="list"
        [text]="suggestText"
        (picked)="add($event)"
      >
        <input
          [id]="id + '-add'"
          autocomplete="off"
          uiInput
          uiSuggestInput
          class="w-full"
          [disabled]="disabled()"
          [value]="query()"
          [placeholder]="text.addPlaceholder"
          (input)="query.set($any($event.target).value)"
        />
        <ng-template uiSuggestRow [of]="list" let-item let-query="query">
          <ui-suggestion
            [segments]="item.name | matchSegments: query : alternateQuery()"
          >
            @if (item.publishedAt === null) {
              {{ products.unpublished }}
            }
          </ui-suggestion>
        </ng-template>
      </ui-suggest-field>
    </div>
  `,
})
export class OrderAdjustLines {
  protected readonly chevronDownIcon = chevronDownIcon;
  protected readonly chevronUpIcon = chevronUpIcon;
  protected readonly xIcon = xIcon;
  private readonly productsService = inject(ProductsService);
  protected readonly text = inject(ADMIN_TEXT).orders.adjust.lines;
  protected readonly products = inject(ADMIN_TEXT).products;
  protected readonly pieceUnit = inject(SHARED_TEXT).units.piece;
  private readonly availability = inject(SHARED_TEXT).product.availability;
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  protected readonly partialPrice = partialPriceRule(this.currency);
  protected readonly id = `adjust-lines-${++nextId}`;
  protected readonly suggestText = {
    suggestionsAria: this.text.addLabel,
    noSuggestions: this.text.noMatches,
    suggestionCountAria: this.text.suggestionCountAria,
  };

  readonly lines = input.required<readonly AdjustLineRow[]>();
  readonly disabled = input(false);

  readonly piecesChanged = output<{ index: number; pieces: number }>();
  readonly priceChanged = output<{ index: number; price: string }>();
  readonly moved = output<{ from: number; to: number }>();
  readonly removed = output<number>();
  readonly added = output<AdminProductListItem>();

  protected readonly query = signal('');

  protected readonly list = new SuggestList<AdminProductListItem>({
    load: (q) =>
      this.productsService.list({ q, sort: 'relevance' }).then((r) => r.items),
    minLength: 2,
    /** Not offered twice: one product, one line. */
    shown: (answer) => {
      const taken = new Set(this.lines().map((line) => line.slug));
      return answer
        .filter((item) => !taken.has(item.slug))
        .slice(0, SUGGESTIONS_SHOWN);
    },
  });
  private readonly layout = inject(AlternateLayout);
  protected readonly alternateQuery = computed(() =>
    this.layout.of(this.list.query()),
  );

  /** The currency inside the field; a price is always per piece. */
  protected priceSuffix(): string {
    return currencySymbol(this.currency);
  }

  protected removeLabel(line: AdjustLineRow): string {
    return `${this.text.removeAria}: ${line.name}`;
  }

  protected moveLabel(line: AdjustLineRow, action: string): string {
    return `${action}: ${line.name}`;
  }

  protected flagLabel(flag: AdjustmentLineFlag): string {
    if (flag === 'deleted') return this.products.deleted;
    if (flag === 'unpublished') return this.products.unpublished;
    return this.availability.out;
  }

  protected tone(flag: AdjustmentLineFlag): 'danger' | 'waiting' {
    return flag === 'deleted' ? 'danger' : 'waiting';
  }

  protected piecesTyped(index: number, value: string): void {
    const pieces = Number(value);
    // A cleared field is mid-edit: the draft keeps the last count.
    if (!Number.isInteger(pieces) || pieces < 1) return;
    this.piecesChanged.emit({ index, pieces });
  }

  protected priceTyped(index: number, price: string): void {
    this.priceChanged.emit({ index, price });
  }

  protected add(item: AdminProductListItem): void {
    this.added.emit(item);
    this.query.set('');
  }
}
