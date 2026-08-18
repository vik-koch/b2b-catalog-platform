import { Component, computed, inject, input, output } from '@angular/core';
import { piecePriceMilliMinor, totalMinor } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { formatPiecePrice, formatPriceMinor } from '../../catalog/price';
import { FieldLabel } from '../../ui/field-label';
import { NumericField } from '../../ui/numeric-field';

/**
 * How a product is packaged, and how many pieces its price covers.
 *
 * Laid out as the same table as the attribute grid above it, but built from
 * ordinary inputs: the grid is one `contenteditable` region, and typed fields
 * inside it would be clobbered by its paste and readback.
 *
 * Values are kept as strings so a half-typed number is not thrown away; the
 * page parses them on save. Empty means "not sold in that unit", except for the
 * basis and minimum, where it means 1.
 */
export interface PackagingDraft {
  piecesPerPack: string;
  packsPerBox: string;
  minPieceQty: string;
  priceBasisPieces: string;
  boxVolume: string;
  boxWeight: string;
}

/**
 * The two required counts hold a real `1` rather than an empty field showing a
 * greyed placeholder: "minimum 1 piece" and "the price covers 1 piece" are the
 * actual rules, and stating them is clearer than leaving a blank to interpret.
 */
export const emptyPackaging = (): PackagingDraft => ({
  piecesPerPack: '',
  packsPerBox: '',
  minPieceQty: '1',
  priceBasisPieces: '1',
  boxVolume: '',
  boxWeight: '',
});

/** The fields that must always hold a number; the rest may be left unset. */
const REQUIRED_COUNTS = ['minPieceQty', 'priceBasisPieces'] as const;

/** A whole number, or null for blank/invalid. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 ? value : null;
}

@Component({
  selector: 'app-product-packaging-editor',
  imports: [FieldLabel, NumericField],
  template: `
    <fieldset>
      <legend appFieldLabel>{{ text.heading }}</legend>
      <p class="mb-2 text-xs text-subtle">{{ text.hint }}</p>

      <!-- Column widths mirror the attribute grid above, so the two tables line
           up. The third column stands where its row actions are, and carries
           what each row costs once the price is applied to it. -->
      <table class="w-full max-w-2xl border-collapse text-sm">
        <tbody>
          @for (row of rows(); track row.key) {
            <tr>
              <th
                scope="row"
                class="w-1/3 border border-border-strong bg-stone-50 px-2 py-1.5 text-left font-medium"
              >
                <label [attr.for]="'packaging-' + row.key">{{
                  row.label
                }}</label>
              </th>
              <!-- The unit sits inside the cell, after the value it measures,
                   and the focus ring is drawn around the pair — so the cell
                   behaves as one field, like the attribute grid's. -->
              <td
                class="border border-border-strong p-0 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-secondary"
                [class]="row.disabled ? 'bg-stone-100' : 'bg-white'"
              >
                <div class="flex items-center">
                  <input
                    [id]="'packaging-' + row.key"
                    type="text"
                    [attr.inputmode]="row.inputMode"
                    [appNumericField]="row.inputMode"
                    class="h-10 min-w-0 flex-1 bg-transparent px-2 py-1.5 leading-6 outline-none disabled:cursor-not-allowed"
                    [value]="row.value"
                    [placeholder]="row.placeholder"
                    [disabled]="row.disabled"
                    (input)="edit(row.key, $any($event.target).value)"
                    (blur)="normalize(row.key)"
                  />
                  @if (row.suffix) {
                    <span class="pr-2 text-xs text-subtle">{{
                      row.suffix
                    }}</span>
                  }
                </div>
              </td>
              <td class="w-32 border-0 pl-5 align-middle text-xs text-subtle">
                {{ row.price }}
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (basisError()) {
        <p class="mt-2 text-sm text-red-700" role="alert">
          {{ text.basisMustDivide }}
        </p>
      }
    </fieldset>
  `,
})
export class ProductPackagingEditor {
  protected readonly text = inject(ADMIN_TEXT).productEditor.packaging;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  readonly value = input.required<PackagingDraft>();
  /** The base price, so the basis can show what a piece actually costs. */
  readonly priceMinor = input<number | null>(null);
  readonly valueChange = output<PackagingDraft>();

  /**
   * Ordered the way the values depend on each other: what a piece costs and how
   * few may be bought, then the packs a piece goes into, then the box those
   * packs go into, then that box's dimensions. Each outer level stays disabled
   * until the one it is measured in exists — a box of nothing is not a thing,
   * and its weight even less so.
   */
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
      inputMode: opts.decimal ? ('decimal' as const) : ('integer' as const),
      disabled: opts.enabled === false,
    });

    return [
      row('minPieceQty', this.text.minPieceQty, {
        placeholder: '1',
        suffix: this.text.pieceSuffix,
      }),
      row('priceBasisPieces', this.text.priceBasis, {
        placeholder: '1',
        suffix: this.text.pieceSuffix,
        price: prices.piece,
      }),
      row('piecesPerPack', this.text.piecesPerPack, {
        placeholder: this.text.notSoldPerPack,
        price: prices.pack,
      }),
      row('packsPerBox', this.text.packsPerBox, {
        placeholder: this.text.notSoldPerBox,
        price: prices.box,
        enabled: hasPack,
      }),
      row('boxVolume', this.text.boxVolume, {
        suffix: this.units.volume,
        decimal: true,
        enabled: hasBox,
      }),
      row('boxWeight', this.text.boxWeight, {
        suffix: this.units.weight,
        decimal: true,
        enabled: hasBox,
      }),
    ];
  });

  private readonly units = inject(DEPLOYMENT_CONFIG).catalog.boxUnits;

  /**
   * What the entered packaging costs, per unit — the check that catches a basis
   * typed as 100 when the price is per pack, and shows what a pack or a box
   * will be sold for.
   */
  private readonly unitPrices = computed(() => {
    const price = this.priceMinor();
    const v = this.value();
    const basis = parseCount(v.priceBasisPieces) ?? 1;
    const pack = parseCount(v.piecesPerPack);
    const box = parseCount(v.packsPerBox);
    if (price === null) return { piece: '', pack: '', box: '' };

    const per = (pieces: number | null, template: string) => {
      const total = pieces === null ? null : totalMinor(price, basis, pieces);
      return total === null
        ? ''
        : template.replace('{price}', formatPriceMinor(total, this.currency));
    };

    return {
      // Only where the basis makes it a different number from the price itself.
      piece:
        basis === 1
          ? ''
          : this.text.pricePerPiece.replace(
              '{price}',
              formatPiecePrice(
                piecePriceMilliMinor(price, basis),
                this.currency,
              ),
            ),
      pack: per(pack, this.text.pricePerPack),
      box: per(
        pack === null || box === null ? null : pack * box,
        this.text.pricePerBox,
      ),
    };
  });

  /** Mirrors the server's rule, so the refusal arrives while typing. */
  protected readonly basisError = computed(() => {
    const v = this.value();
    const basis = parseCount(v.priceBasisPieces) ?? 1;
    const min = parseCount(v.minPieceQty) ?? 1;
    const pack = parseCount(v.piecesPerPack);
    return min % basis !== 0 || (pack !== null && pack % basis !== 0);
  });

  protected edit(key: keyof PackagingDraft, raw: string): void {
    const current = this.value();
    const next = { ...current, [key]: raw };
    // The minimum is usually the pack size, so it tracks it while it is unset
    // or still matching — like a slug tracking a name. A minimum somebody set to
    // something else is left alone.
    const tracking =
      current.minPieceQty === '1' ||
      current.minPieceQty === '' ||
      current.minPieceQty === current.piecesPerPack;
    if (key === 'piecesPerPack' && tracking) {
      next.minPieceQty = raw || '1';
    }
    // Clearing a level takes what it contained with it, so nothing is left
    // stranded in a field that is now disabled and invisible on save.
    if (key === 'piecesPerPack' && parseCount(raw) === null) {
      next.packsPerBox = '';
    }
    if (
      (key === 'piecesPerPack' || key === 'packsPerBox') &&
      parseCount(next.packsPerBox) === null
    ) {
      next.boxVolume = '';
      next.boxWeight = '';
    }
    this.valueChange.emit(next);
  }

  /**
   * Puts a required count back to 1 when it is left empty or at zero. Done on
   * blur rather than per keystroke, so clearing the field to retype it does not
   * fight the typing.
   */
  protected normalize(key: keyof PackagingDraft): void {
    if (!REQUIRED_COUNTS.includes(key as (typeof REQUIRED_COUNTS)[number])) {
      return;
    }
    if (parseCount(this.value()[key]) === null) {
      this.valueChange.emit({ ...this.value(), [key]: '1' });
    }
  }
}
