import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  AdjustmentLineFlag,
  AdminProductListItem,
  fillText,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { currencySymbol } from '../../catalog/price';
import { HighlightedLine } from '../../core/highlighted-line';
import { SUGGEST_PANEL, SuggestList } from '../../core/suggest-list';
import { AdminCatalogService } from '../admin-catalog.service';
import { FieldLabel } from '../../ui/field-label';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { PriceField } from '../../ui/price-field';
import { StatusBadge } from '../../ui/status-badge';
import { UNIT_FIELD_INPUT, UnitField } from '../../ui/unit-field';

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
  /** How many basis units — the staff reading of a quantity (FR-UNIT-04). */
  units: number;
  /** The price of one basis unit, as typed. Empty only in the moment between
   * a line being added and the server saying what the list charges for it:
   * the answer is written into the field rather than shown behind it, so the
   * figure a manager corrects is a figure they can edit. */
  priceText: string;
  /** How many pieces one basis unit is, once the server has said. */
  basisPieces: number | null;
  /** The customer's own reading of the quantity, and their words about the
   * line — both carried, neither edited. */
  quantityLabel: string;
  note: string | null;
  totalLabel: string;
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
 * Counted in **basis units** rather than in the customer's own unit: it is how
 * staff read a line and how the source system prices one, and it is the only
 * count that cannot produce a quantity the line's price does not divide. What
 * the customer sees — "2 pk", their note — is shown beside it, unedited.
 *
 * Nothing here is priced on the client. The figures beside each line are the
 * server's answer to the draft as it stands, so the total a manager approves
 * is the total that gets written.
 */
@Component({
  selector: 'app-order-adjust-lines',
  imports: [
    AdminIcon,
    FieldLabel,
    HighlightedLine,
    IconButton,
    Input,
    PriceField,
    Skeleton,
    StatusBadge,
    UnitField,
  ],
  host: { class: 'block' },
  template: `
    <ul class="divide-y divide-border border-b border-border">
      @for (line of lines(); track line.key; let i = $index) {
        <li class="py-2 first:pt-0">
          <!-- The name has the row to itself: a long one is the ordinary case
               on a catalogue of several hundred, and sharing the row with the
               figures left it two words wide with the note under it wrapped
               four times. -->
          <span class="block">{{ line.name }}</span>
          @if (line.note) {
            <span class="block text-sm text-subtle italic">{{
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
            <app-unit-field class="w-28" [unit]="unitsSuffix(line)">
              <input
                [class]="unitFieldInput"
                type="number"
                min="1"
                step="1"
                [id]="id + '-units-' + i"
                [attr.aria-label]="text.units"
                [disabled]="disabled()"
                [value]="line.units"
                (input)="unitsTyped(i, $any($event.target).value)"
              />
            </app-unit-field>
            <app-unit-field class="w-28" [unit]="priceSuffix(line)">
              <input
                appPriceField
                [class]="unitFieldInput"
                type="text"
                inputmode="decimal"
                [id]="id + '-price-' + i"
                [attr.aria-label]="text.price"
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
                  <span class="block text-sm text-subtle">
                    {{ line.quantityLabel }}
                  </span>
                  <span class="block">{{ line.totalLabel }}</span>
                } @else {
                  <app-skeleton class="w-20" [lines]="2" />
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
                  [attr.aria-label]="moveLabel(line, text.moveUp)"
                  (click)="moved.emit({ from: i, to: i - 1 })"
                >
                  <app-admin-icon name="chevron-up" />
                </button>
                <button
                  appIconButton
                  type="button"
                  [disabled]="disabled() || i === lines().length - 1"
                  [attr.aria-label]="moveLabel(line, text.moveDown)"
                  (click)="moved.emit({ from: i, to: i + 1 })"
                >
                  <app-admin-icon name="chevron-down" />
                </button>
                <button
                  appIconButton
                  type="button"
                  [disabled]="disabled()"
                  [attr.aria-label]="removeLabel(line)"
                  (click)="removed.emit(i)"
                >
                  <app-admin-icon name="x" />
                </button>
              </span>
            </span>
          </div>
        </li>
      } @empty {
        <li class="py-3 text-sm text-subtle">{{ text.empty }}</li>
      }
    </ul>

    <!-- Adding a product: the catalog whole, published or not. An order may
         perfectly well be filled from something the storefront does not
         offer, and a staff screen that hides it would send somebody to
         publish a product just to put it on one order. -->
    <div class="relative mt-4">
      <label [for]="id + '-add'" appFieldLabel>{{ text.addLabel }}</label>
      <input
        [id]="id + '-add'"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        appInput
        class="w-full"
        [attr.aria-expanded]="list.panelOpen()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeOptionId()"
        [disabled]="disabled()"
        [value]="query()"
        [placeholder]="text.addPlaceholder"
        (input)="type($any($event.target).value)"
        (keydown)="keydown($event)"
        (blur)="list.close()"
      />
      @if (list.panelOpen()) {
        <div [class]="panel">
          @if (options().length === 0) {
            <p class="px-3 py-2 text-sm text-subtle">{{ text.noMatches }}</p>
          }
          <ul [id]="listId" role="listbox" [attr.aria-label]="text.addLabel">
            @for (item of options(); track item.slug; let i = $index) {
              <li
                [id]="listId + '-' + i"
                role="option"
                class="cursor-pointer px-3 py-2 text-sm"
                [attr.aria-selected]="i === list.activeIndex()"
                [class.bg-stone-100]="i === list.activeIndex()"
                (mouseenter)="list.activeIndex.set(i)"
                (mousedown)="pick($event, item)"
              >
                <span class="block truncate">
                  <app-highlighted-line
                    [line]="item.name"
                    [query]="list.query()"
                  />
                </span>
                @if (item.publishedAt === null) {
                  <span class="block text-xs text-subtle">
                    {{ text.unpublished }}
                  </span>
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class OrderAdjustLines {
  private readonly catalog = inject(AdminCatalogService);
  protected readonly text = inject(ADMIN_TEXT).orderAdjust.lines;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  protected readonly unitFieldInput = UNIT_FIELD_INPUT;
  protected readonly panel = SUGGEST_PANEL;
  protected readonly id = `adjust-lines-${++nextId}`;
  protected readonly listId = `${this.id}-suggestions`;

  readonly lines = input.required<readonly AdjustLineRow[]>();
  readonly disabled = input(false);

  readonly unitsChanged = output<{ index: number; units: number }>();
  readonly priceChanged = output<{ index: number; price: string }>();
  readonly moved = output<{ from: number; to: number }>();
  readonly removed = output<number>();
  readonly added = output<AdminProductListItem>();

  protected readonly query = signal('');

  protected readonly list = new SuggestList<AdminProductListItem>({
    load: (q) =>
      this.catalog.listProducts({ q, sort: 'relevance' }).then((r) => r.items),
    minLength: 2,
  });

  /** A product already on the order is not offered again: a product in a given
   * unit is one line, and a second one would be two lines to reconcile. */
  protected readonly options = computed(() => {
    const taken = new Set(this.lines().map((line) => line.slug));
    return this.list
      .suggestions()
      .filter((item) => !taken.has(item.slug))
      .slice(0, SUGGESTIONS_SHOWN);
  });

  protected readonly activeOptionId = computed(() =>
    this.list.panelOpen() && this.list.activeIndex() >= 0
      ? `${this.listId}-${this.list.activeIndex()}`
      : null,
  );

  /**
   * What the quantity field counts in, printed inside it. A line is quantified
   * in the units its price is per (FR-UNIT-04) — pieces where that is one of
   * them, and packs of so many where it is not. Saying which inside the box is
   * what lets the caption above it go.
   */
  protected unitsSuffix(line: AdjustLineRow): string {
    const basis = line.basisPieces ?? 1;
    return basis > 1
      ? fillText(this.text.unitsSuffix, { count: basis })
      : this.text.pieces;
  }

  /** And what the price is per, on the same principle. */
  protected priceSuffix(line: AdjustLineRow): string {
    const symbol = currencySymbol(this.currency);
    const basis = line.basisPieces ?? 1;
    return basis > 1
      ? fillText(this.text.priceSuffix, { symbol, count: basis })
      : symbol;
  }

  protected removeLabel(line: AdjustLineRow): string {
    return `${this.text.remove}: ${line.name}`;
  }

  protected moveLabel(line: AdjustLineRow, action: string): string {
    return `${action}: ${line.name}`;
  }

  protected flagLabel(flag: AdjustmentLineFlag): string {
    if (flag === 'deleted') return this.text.deleted;
    if (flag === 'unpublished') return this.text.unpublished;
    return this.text.outOfStock;
  }

  protected tone(flag: AdjustmentLineFlag): 'danger' | 'waiting' {
    return flag === 'deleted' ? 'danger' : 'waiting';
  }

  protected unitsTyped(index: number, value: string): void {
    const units = Number(value);
    // A field being cleared is a field mid-edit, not a line of nothing: the
    // draft keeps the last real count until a new one is typed.
    if (!Number.isInteger(units) || units < 1) return;
    this.unitsChanged.emit({ index, units });
  }

  protected priceTyped(index: number, price: string): void {
    this.priceChanged.emit({ index, price });
  }

  protected type(value: string): void {
    this.query.set(value);
    this.list.type(value);
  }

  protected keydown(event: KeyboardEvent): void {
    const chosen = this.list.keydown(event);
    if (chosen) this.add(chosen);
  }

  /** mousedown, not click: the field's own blur would close the panel first. */
  protected pick(event: MouseEvent, item: AdminProductListItem): void {
    event.preventDefault();
    this.add(item);
  }

  private add(item: AdminProductListItem): void {
    this.added.emit(item);
    this.query.set('');
    this.list.close();
  }
}
