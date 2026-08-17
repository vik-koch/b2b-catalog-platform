import { Component, computed, inject, input, output } from '@angular/core';
import { piecePriceMilliMinor } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { formatPiecePrice } from '../../catalog/price';
import { FieldLabel } from '../../ui/field-label';

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

export const emptyPackaging = (): PackagingDraft => ({
  piecesPerPack: '',
  packsPerBox: '',
  minPieceQty: '',
  priceBasisPieces: '',
  boxVolume: '',
  boxWeight: '',
});

/** A whole number, or null for blank/invalid. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 ? value : null;
}

@Component({
  selector: 'app-product-packaging-editor',
  imports: [FieldLabel],
  template: `
    <fieldset>
      <legend appFieldLabel>{{ text.heading }}</legend>
      <p class="mb-2 text-xs text-subtle">{{ text.hint }}</p>

      <!-- Column widths mirror the attribute grid above, so the two tables line
           up: a third column stands where its row actions are, holding the unit
           each value is measured in. -->
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
              <!-- The input fills the cell, so the whole cell is the target the
                   way it is in the attribute grid. -->
              <td class="border border-border-strong bg-white p-0">
                <input
                  [id]="'packaging-' + row.key"
                  type="text"
                  [attr.inputmode]="row.inputMode"
                  class="h-10 w-full bg-transparent px-2 py-1.5 leading-6 outline-none focus:outline-2 focus:-outline-offset-2 focus:outline-secondary"
                  [value]="row.value"
                  [placeholder]="row.placeholder"
                  (input)="edit(row.key, $any($event.target).value)"
                />
              </td>
              <td class="w-32 border-0 pl-2 align-middle text-xs text-subtle">
                {{ row.suffix }}
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (piecePreview(); as preview) {
        <p class="mt-2 text-xs text-subtle">
          {{ text.piecePricePreview.replace('{price}', preview) }}
        </p>
      }
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

  protected readonly rows = computed(() => {
    const v = this.value();
    const count = (
      key: 'piecesPerPack' | 'packsPerBox' | 'minPieceQty' | 'priceBasisPieces',
      label: string,
      placeholder: string,
      suffix = '',
    ) => ({
      key,
      label,
      value: v[key],
      placeholder,
      suffix,
      inputMode: 'numeric',
    });

    return [
      count('piecesPerPack', this.text.piecesPerPack, this.text.notSold),
      count('packsPerBox', this.text.packsPerBox, this.text.notSold),
      count('minPieceQty', this.text.minPieceQty, '1'),
      count(
        'priceBasisPieces',
        this.text.priceBasis,
        '1',
        this.text.priceBasisSuffix,
      ),
      {
        key: 'boxVolume' as const,
        label: this.text.boxVolume,
        value: v.boxVolume,
        placeholder: '',
        suffix: this.units.volume,
        inputMode: 'decimal',
      },
      {
        key: 'boxWeight' as const,
        label: this.text.boxWeight,
        value: v.boxWeight,
        placeholder: '',
        suffix: this.units.weight,
        inputMode: 'decimal',
      },
    ];
  });

  private readonly units = inject(DEPLOYMENT_CONFIG).catalog.boxUnits;

  /** What one piece costs at the entered basis — the check that catches a basis
   * typed as 100 when the price is per pack. */
  protected readonly piecePreview = computed(() => {
    const price = this.priceMinor();
    const basis = parseCount(this.value().priceBasisPieces) ?? 1;
    if (price === null || basis === 1) return null;
    return formatPiecePrice(piecePriceMilliMinor(price, basis), this.currency);
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
    // The minimum is usually the pack size, so it tracks it while it is blank or
    // still matching — like a slug tracking a name. A minimum somebody set to
    // something else is left alone.
    if (
      key === 'piecesPerPack' &&
      (!current.minPieceQty || current.minPieceQty === current.piecesPerPack)
    ) {
      next.minPieceQty = raw;
    }
    this.valueChange.emit(next);
  }
}
