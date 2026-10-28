import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { moneyFormat } from '@b2b-catalog-platform/shared';
import {
  AdjustmentLineFlag,
  AdminProductListItem,
} from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { currencySymbol, partialPriceRule } from '../../shared/catalog/price';
import { HighlightedLine } from '../../shared/ui/highlighted-line';
import { MatchSegmentsPipe } from '../../shared/catalog/match-segments.pipe';
import { AlternateLayout } from '../../shared/core/alternate-layout';
import { SuggestList } from '../../shared/ui/suggest-list';
import { AdminCatalogService } from '../admin-catalog.service';
import { FieldLabel } from '../../shared/ui/field-label';
import { IconButton } from '../../shared/ui/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '../../shared/ui/input';
import { Skeleton } from '../../shared/ui/skeleton';
import { Allow } from '../../shared/ui/allow';
import { StatusBadge } from '../../shared/ui/status-badge';
import { SuggestField } from '../../shared/ui/suggest-field';
import { SuggestInput } from '../../shared/ui/suggest-input';
import { SuggestRow } from '../../shared/ui/suggest-row';
import { UnitField } from '../../shared/ui/unit-field';
import { UnitFieldInput } from '../../shared/ui/unit-field-input';
import { chevronDownIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-down';
import { chevronUpIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-up';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** `aria-controls` must name one list, and a page may hold more than one. */
let nextId = 0;

/** Enough rows to choose from without the panel becoming a listing of its own. */
const SUGGESTIONS_SHOWN = 8;

/** One line as this editor holds it: what is sent, plus how it reads. */
export interface AdjustLineRow {
  slug: string;
  name: string;
  /** Stable across every redraw, so a row keeps its DOM — and so the field
   * somebody is typing in keeps its cursor — when the list is reordered or a
   * line above it is removed. */
  key: string;
  /** How many pieces — the staff reading of a quantity. */
  pieces: number;
  /** The price of one piece, as typed. Empty only in the moment between a line
   * being added and the server saying what the list charges for it: the answer
   * is written into the field rather than shown behind it, so the figure a
   * manager corrects is a figure they can edit. */
  priceText: string;
  /** The customer's own reading of the quantity, and their words about the
   * line — both carried, neither edited. */
  quantityLabel: string;
  note: string | null;
  totalLabel: string;
  /** The rate the new version will state for the line (NFR-LEGAL-11), or
   * empty where it states none. */
  taxLabel: string;
  flags: readonly AdjustmentLineFlag[];
  /** Whether this line is priced away from the list it would otherwise take
   * (FR-CART-09) — marked on the line, and counted again above the save
   * button, because a price nobody meant to type is the one mistake this
   * screen can make silently. */
  offList: boolean;
}

/**
 * The lines of an order being adjusted (FR-ORD-03).
 *
 * Counted in **pieces** rather than in the customer's own unit: it is how
 * staff read a line and how the source system prices one. What the customer
 * sees — "2 pk", their note — is shown beside it, unedited.
 *
 * Nothing here is priced on the client. The figures beside each line are the
 * server's answer to the draft as it stands, so the total a manager approves
 * is the total that gets written.
 */
@Component({
  selector: 'app-order-adjust-lines',
  imports: [
    Icon,
    FieldLabel,
    HighlightedLine,
    MatchSegmentsPipe,
    IconButton,
    Input,
    Allow,
    Skeleton,
    StatusBadge,
    SuggestField,
    SuggestInput,
    SuggestRow,
    UnitField,
    UnitFieldInput,
  ],
  host: { class: 'block' },
  template: `
    <ul class="divide-y divide-edge border-b border-edge">
      @for (line of lines(); track line.key; let i = $index) {
        <li class="py-2 first:pt-0">
          <!-- The name has the row to itself: a long one is the ordinary case
               on a catalogue of about 1,500, and sharing the row with the
               figures left it two words wide with the note under it wrapped
               four times. -->
          <span class="block">{{ line.name }}</span>
          @if (line.note) {
            <span class="block text-sm text-ink-subtle italic">{{
              line.note
            }}</span>
          }

          <!-- Everything the line *is*, on one row: what is being charged for,
               what one costs, what the customer reads that as, what it comes
               to, and the three controls. The two fields wear their own units,
               so neither needs a caption — a label above, a unit beside and a
               hint below would be four lines for two numbers, and a form of
               forty lines is read by scrolling. -->
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <app-unit-field class="w-28" [unit]="pieceUnit">
              <input
                appUnitFieldInput
                type="number"
                min="1"
                step="1"
                [id]="id + '-pieces-' + i"
                [attr.aria-label]="text.unitsAria"
                [disabled]="disabled()"
                [value]="line.pieces"
                (input)="piecesTyped(i, $any($event.target).value)"
              />
            </app-unit-field>
            <app-unit-field class="w-28" [unit]="priceSuffix()">
              <input
                [appAllow]="partialPrice"
                appUnitFieldInput
                type="text"
                inputmode="decimal"
                [id]="id + '-price-' + i"
                [attr.aria-label]="text.priceAria"
                [disabled]="disabled()"
                [value]="line.priceText"
                (input)="priceTyped(i, $any($event.target).value)"
              />
            </app-unit-field>
            @if (line.offList) {
              <span appStatusBadge tone="info">{{ text.offList }}</span>
            }
            @for (flag of line.flags; track flag) {
              <span appStatusBadge [tone]="tone(flag)">
                {{ flagLabel(flag) }}
              </span>
            }

            <span class="ml-auto flex shrink-0 items-center gap-3">
              <!-- What the customer reads the line as, over what it comes to:
                   the two are one sentence — this much of it, for this much
                   money — and they are the server's answer to the two fields
                   on their left, so they end the row those fields begin.
                   Bars until that answer arrives, so the row does not grow
                   a line under somebody already reading it. -->
              <span class="text-right">
                @if (line.totalLabel) {
                  <span class="block text-sm text-ink-subtle">
                    {{ line.quantityLabel }}
                  </span>
                  <span class="block">{{ line.totalLabel }}</span>
                  @if (line.taxLabel) {
                    <span class="block text-xs text-ink-subtle">
                      {{ line.taxLabel }}
                    </span>
                  }
                } @else {
                  <!-- Two bars the shape of the two lines they stand in for:
                       the reading above at its size, the figure below at its
                       own, both hung off the right edge the figures are set
                       against. -->
                  <span class="block w-20">
                    <app-skeleton
                      size="sm"
                      align="right"
                      [widths]="['4.5rem']"
                    />
                    <app-skeleton
                      size="base"
                      align="right"
                      [widths]="['3.25rem']"
                    />
                  </span>
                }
              </span>
              <!-- Moving a line is not a change to the order, and the change
                   list says so. It is here because a picking list is read top
                   to bottom, and the one thing a manager must not have to do
                   to reorder it is delete a line and add it again — which
                   loses its agreed price. -->
              <span class="flex shrink-0 items-center">
                <button
                  appIconButton
                  type="button"
                  [disabled]="disabled() || i === 0"
                  [attr.aria-label]="moveLabel(line, text.moveUpAria)"
                  (click)="moved.emit({ from: i, to: i - 1 })"
                >
                  <app-icon [glyph]="chevronUpIcon" />
                </button>
                <button
                  appIconButton
                  type="button"
                  [disabled]="disabled() || i === lines().length - 1"
                  [attr.aria-label]="moveLabel(line, text.moveDownAria)"
                  (click)="moved.emit({ from: i, to: i + 1 })"
                >
                  <app-icon [glyph]="chevronDownIcon" />
                </button>
                <button
                  appIconButton
                  type="button"
                  [disabled]="disabled()"
                  [attr.aria-label]="removeLabel(line)"
                  (click)="removed.emit(i)"
                >
                  <app-icon [glyph]="xIcon" />
                </button>
              </span>
            </span>
          </div>
        </li>
      } @empty {
        <li class="py-3 text-sm text-ink-subtle">{{ text.empty }}</li>
      }
    </ul>

    <!-- Adding a product: the catalog whole, published or not. An order may
         perfectly well be filled from something the storefront does not
         offer, and a staff screen that hides it would send somebody to
         publish a product just to put it on one order. -->
    <div class="mt-4">
      <label [for]="id + '-add'" appFieldLabel>{{ text.addLabel }}</label>
      <app-suggest-field
        [list]="list"
        [text]="suggestText"
        (picked)="add($event)"
      >
        <input
          [id]="id + '-add'"
          autocomplete="off"
          appInput
          appSuggestInput
          class="w-full"
          [disabled]="disabled()"
          [value]="query()"
          [placeholder]="text.addPlaceholder"
          (input)="query.set($any($event.target).value)"
        />
        <ng-template appSuggestRow [of]="list" let-item let-query="query">
          <span class="block truncate">
            <app-highlighted-line
              [segments]="item.name | matchSegments: query : alternateQuery()"
            />
          </span>
          @if (item.publishedAt === null) {
            <span class="block text-xs text-ink-subtle">
              {{ products.unpublished }}
            </span>
          }
        </ng-template>
      </app-suggest-field>
    </div>
  `,
})
export class OrderAdjustLines {
  protected readonly chevronDownIcon = chevronDownIcon;
  protected readonly chevronUpIcon = chevronUpIcon;
  protected readonly xIcon = xIcon;
  private readonly catalog = inject(AdminCatalogService);
  protected readonly text = inject(ADMIN_TEXT).orders.adjust.lines;
  protected readonly products = inject(ADMIN_TEXT).products;
  protected readonly pieceUnit = inject(SHARED_TEXT).units.piece;
  private readonly availability = inject(SHARED_TEXT).product.availability;
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  protected readonly partialPrice = partialPriceRule(this.currency);
  protected readonly id = `adjust-lines-${++nextId}`;
  /** The field's label names the list: the panel is the search's answer. */
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
      this.catalog.listProducts({ q, sort: 'relevance' }).then((r) => r.items),
    minLength: 2,
    /** A product already on the order is not offered again: a product in a
     * given unit is one line, and a second one would be two lines to
     * reconcile. */
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

  /** What the price field is per, printed inside it — the currency alone,
   * since a price is always the price of one piece. Saying it inside the box
   * is what lets the caption above it go. */
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
    // A field being cleared is a field mid-edit, not a line of nothing: the
    // draft keeps the last real count until a new one is typed.
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
