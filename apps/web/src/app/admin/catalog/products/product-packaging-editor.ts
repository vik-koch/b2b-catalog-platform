import { Component, computed, inject, input, output } from '@angular/core';
import { totalMinor } from '@b2b-catalog-platform/shared/core/catalog';
import { fillText, moneyFormat } from '@b2b-catalog-platform/shared';

import { formatPriceMinor } from '../../../core/catalog/price';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { injectNarrowScreen } from '@b2b-catalog-platform/ui/core/narrow-screen';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { UnitInput } from '@b2b-catalog-platform/ui/inputs/unit-input';
import { UnitInputControl } from '@b2b-catalog-platform/ui/inputs/unit-input-control';
import { numericRules } from '@b2b-catalog-platform/ui/inputs/numeric-rules';
import { Allow } from '@b2b-catalog-platform/ui/inputs/allow';

/**
 * Strings, so a half-typed number survives; the page parses them on save.
 * Empty is "not sold in that unit".
 */
export interface PackagingDraft {
  piecesPerPack: string;
  packsPerBox: string;
  minPieceQty: string;
  boxVolume: string;
  boxWeight: string;
  /** How many boxes ship. */
  boxCount: string;
}

/** The minimum holds a real `1`, not a placeholder: it is the rule. */
export const emptyPackaging = (): PackagingDraft => ({
  piecesPerPack: '',
  packsPerBox: '',
  minPieceQty: '1',
  boxVolume: '',
  boxWeight: '',
  boxCount: '',
});

/** The fields that hold a whole number, where they hold any. */
const COUNT_KEYS = [
  'piecesPerPack',
  'packsPerBox',
  'minPieceQty',
  'boxCount',
] as const;

/** Ids for the error line; a page may hold more than one editor. */
let nextId = 0;

/** A whole number of one or more, else null. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 ? value : null;
}

/**
 * How a product is packed, as a table lined up with the attribute grid above
 * but of ordinary inputs: the grid is one `contenteditable` region, whose
 * paste and readback would clobber typed fields inside it.
 */
@Component({
  selector: 'app-product-packaging-editor',
  imports: [ErrorText, FieldLabel, Allow, UnitInput, UnitInputControl],
  template: `
    <!-- A <fieldset> will not shrink below its content's min-content width. -->
    <fieldset class="min-w-0">
      <legend uiFieldLabel>{{ packing.heading }}</legend>
      <p class="mb-2 text-xs text-ink-subtle">{{ text.hint }}</p>

      @if (narrow()) {
        <!-- Stacked fields, not the attribute grid's record list: these are a
             fixed form, not rows of the admin's own. One box, as parts of one
             answer; the price column becomes a caption. -->
        <div class="max-w-xl space-y-4 rounded-md border border-edge p-4">
          @for (row of rows(); track row.key) {
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-ink">
                {{ row.label }}
              </span>
              @if (row.hint) {
                <span class="mb-1 block text-xs text-ink-subtle">{{
                  row.hint
                }}</span>
              }
              <ui-unit-input [unit]="row.suffix">
                <input
                  [id]="'packaging-narrow-' + row.key"
                  type="text"
                  [attr.inputmode]="row.inputMode"
                  [uiAllow]="numericRules[row.kind]"
                  uiUnitInputControl
                  [value]="row.value"
                  [placeholder]="row.placeholder"
                  [disabled]="row.disabled"
                  [attr.aria-invalid]="row.invalid || null"
                  [attr.aria-describedby]="row.invalid ? errorId : null"
                  (input)="edit(row.key, $any($event.target).value)"
                  (blur)="normalize(row.key)"
                />
              </ui-unit-input>
              @if (row.price) {
                <span class="mt-1 block text-xs text-ink-subtle">{{
                  row.price
                }}</span>
              }
            </label>
          }
        </div>
      } @else {
        <!-- Widths mirror the attribute grid, so the tables line up. -->
        <table class="w-full max-w-3xl table-fixed border-collapse text-sm">
          <tbody>
            @for (row of rows(); track row.key) {
              <tr>
                <th
                  scope="row"
                  class="w-1/3 border border-edge-strong bg-surface-subtle
                         px-2 py-1.5 text-left font-medium"
                >
                  <label [attr.for]="'packaging-' + row.key">{{
                    row.label
                  }}</label>
                  @if (row.hint) {
                    <span
                      class="mt-0.5 block text-xs font-normal text-ink-subtle"
                      >{{ row.hint }}</span
                    >
                  }
                </th>
                <!-- The ring goes round value and unit, one field as in the
                     attribute grid. -->
                <td
                  class="border border-edge-strong p-0
                         focus-within:outline-1 focus-within:-outline-offset-1
                         focus-within:outline-secondary"
                  [class]="row.disabled ? 'bg-surface' : 'bg-white'"
                >
                  <div class="flex items-center">
                    <input
                      [id]="'packaging-' + row.key"
                      type="text"
                      [attr.inputmode]="row.inputMode"
                      [uiAllow]="numericRules[row.kind]"
                      class="h-10 min-w-0 flex-1 bg-transparent px-2 py-1.5
                             leading-6 outline-none
                             disabled:cursor-not-allowed"
                      [value]="row.value"
                      [placeholder]="row.placeholder"
                      [disabled]="row.disabled"
                      [attr.aria-invalid]="row.invalid || null"
                      [attr.aria-describedby]="row.invalid ? errorId : null"
                      (input)="edit(row.key, $any($event.target).value)"
                      (blur)="normalize(row.key)"
                    />
                    @if (row.suffix) {
                      <span class="pr-3 text-xs text-ink-subtle">{{
                        row.suffix
                      }}</span>
                    }
                  </div>
                </td>
                <td
                  class="w-48 border-0 pl-3 align-middle text-xs
                         text-ink-subtle"
                >
                  {{ row.price }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
      @if (error(); as error) {
        <p uiErrorText [id]="errorId" class="mt-1">{{ error }}</p>
      }
    </fieldset>
  `,
})
export class ProductPackagingEditor {
  protected readonly numericRules = numericRules;
  protected readonly text = inject(ADMIN_TEXT).products.editor.packaging;
  protected readonly packing = inject(SHARED_TEXT).packaging;
  private readonly unitNames = inject(SHARED_TEXT).units;
  private readonly unavailable =
    inject(ADMIN_TEXT).products.editor.packagingUnavailable;
  /** Below `md` a three-column table has no room. */
  protected readonly narrow = injectNarrowScreen('md');
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));

  readonly value = input.required<PackagingDraft>();
  /** So each level can show what it sells for. */
  readonly priceMinor = input<number | null>(null);
  /** Once a save has asked. */
  readonly error = input<string | null>(null);
  readonly valueChange = output<PackagingDraft>();

  protected readonly errorId = `packaging-error-${++nextId}`;

  /** A count that is not whole, or else the minimum: the only other thing the
   * packaging rule refuses. */
  private readonly invalidKeys = computed<ReadonlySet<keyof PackagingDraft>>(
    () => {
      if (!this.error()) return new Set();
      const v = this.value();
      const counts = COUNT_KEYS.filter(
        (key) => v[key].trim() !== '' && parseCount(v[key]) === null,
      );
      return new Set(counts.length ? counts : ['minPieceQty']);
    },
  );

  /** In the order the values depend on each other; an outer level stays
   * disabled until the one it is measured in exists. */
  protected readonly rows = computed(() => {
    const v = this.value();
    const prices = this.unitPrices();
    const hasPack = parseCount(v.piecesPerPack) !== null;
    const hasBox = hasPack && parseCount(v.packsPerBox) !== null;

    const row = (
      key: keyof PackagingDraft,
      label: string,
      opts: {
        placeholder?: string;
        suffix?: string;
        price?: string;
        hint?: string;
        decimal?: boolean;
        enabled?: boolean;
      } = {},
    ) => ({
      key,
      label,
      value: v[key],
      placeholder: opts.placeholder ?? '',
      suffix: opts.suffix ?? '',
      price: opts.price ?? '',
      hint: opts.hint ?? '',
      kind: opts.decimal ? ('decimal' as const) : ('integer' as const),
      // The keyboard a phone shows; `integer` is no `inputmode` value.
      inputMode: opts.decimal ? 'decimal' : 'numeric',
      disabled: opts.enabled === false,
      invalid: this.invalidKeys().has(key),
    });

    return [
      row('piecesPerPack', this.packing.packContains, {
        placeholder: this.text.notSoldPerPack,
        suffix: this.unitNames.piece,
        price: prices.pack,
      }),
      row('minPieceQty', this.text.minPieceQty, {
        placeholder: '1',
        suffix: this.unitNames.piece,
        hint: this.text.minPieceQtyHint,
      }),
      row('packsPerBox', this.packing.boxContains, {
        placeholder: this.text.notSoldPerBox,
        suffix: this.unitNames.pack,
        price: prices.box,
        enabled: hasPack,
      }),
      row('boxVolume', this.packing.boxVolume, {
        suffix: this.units.volume,
        decimal: true,
        enabled: hasBox,
      }),
      row('boxWeight', this.packing.boxWeight, {
        suffix: this.units.weight,
        decimal: true,
        enabled: hasBox,
      }),
      row('boxCount', this.text.boxCount, {
        enabled: hasBox,
      }),
    ];
  });

  private readonly units = inject(DEPLOYMENT_CONFIG).catalog.boxUnits;

  private readonly unitPrices = computed(() => {
    const price = this.priceMinor();
    const v = this.value();
    const pack = parseCount(v.piecesPerPack);
    const box = parseCount(v.packsPerBox);

    // Unpriced shows a dash, where a blank would read as not sold that way.
    const per = (pieces: number | null, template: string) =>
      pieces === null
        ? ''
        : fillText(template, {
            price:
              price === null
                ? this.unavailable
                : formatPriceMinor(totalMinor(price, pieces), this.currency),
          });

    return {
      pack: per(pack, this.text.pricePerPack),
      box: per(
        pack === null || box === null ? null : pack * box,
        this.text.pricePerBox,
      ),
    };
  });

  protected edit(key: keyof PackagingDraft, raw: string): void {
    const current = this.value();
    const next = { ...current, [key]: raw };
    // An empty minimum or one matching the old pack follows the pack, as a
    // slug follows a name; a minimum of 1 is a decision.
    const tracking =
      current.minPieceQty === '' ||
      current.minPieceQty === current.piecesPerPack;
    if (key === 'piecesPerPack' && tracking) {
      next.minPieceQty = raw || '1';
    }
    // Clearing a level clears what it contained, or it would be stranded in a
    // disabled field.
    if (key === 'piecesPerPack' && parseCount(raw) === null) {
      next.packsPerBox = '';
    }
    if (key === 'piecesPerPack' || key === 'packsPerBox') {
      if (parseCount(next.packsPerBox) === null) {
        next.boxVolume = '';
        next.boxWeight = '';
        next.boxCount = '';
      } else if (next.boxCount.trim() === '') {
        // A real value, as the minimum's: one box is the rule.
        next.boxCount = '1';
      }
    }
    this.valueChange.emit(next);
  }

  /**
   * On blur, so clearing a field to retype it does not fight the typing: a
   * required count left empty goes back to 1, and a minimum between two packs
   * (25 against 6) rises to the next whole one. A minimum under one pack is a
   * shop that opens packs, and stays as typed.
   */
  protected normalize(key: keyof PackagingDraft): void {
    const v = this.value();
    const required =
      key === 'minPieceQty' ||
      // A box count only while there is a box; otherwise it stays empty.
      (key === 'boxCount' && parseCount(v.packsPerBox) !== null);
    if (required && parseCount(v[key]) === null) {
      this.valueChange.emit({ ...v, [key]: '1' });
      return;
    }
    if (key !== 'minPieceQty' && key !== 'piecesPerPack') return;
    const pack = parseCount(v.piecesPerPack);
    const min = parseCount(v.minPieceQty);
    if (pack === null || min === null || min < pack || min % pack === 0) {
      return;
    }
    this.valueChange.emit({
      ...v,
      minPieceQty: String(Math.ceil(min / pack) * pack),
    });
  }
}
