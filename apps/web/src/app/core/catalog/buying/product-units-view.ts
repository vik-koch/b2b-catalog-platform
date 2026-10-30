import { inject } from '@angular/core';
import {
  availableUnits,
  pieceFloor,
  piecesPerUnit,
  PRODUCT_UNITS,
  ProductPackaging,
  ProductUnit,
  UnitPrices,
  unitQuantity,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { formatStoredDecimal, formatUnitQuantity } from './quantity';

export interface UnitPriceRow {
  /** "per pcs". */
  label: string;
  price: string;
}

export interface PackagingRow {
  label: string;
  value: string;
}

export interface UnitOption {
  unit: ProductUnit;
  label: string;
  /** Unsold units are still shown, so a grid of cards lines up. */
  available: boolean;
}

/** A product's units of sale in words, alike on a tile and the product page.
 * Unit words are abbreviations after a number, so nothing inflects. */
export function useProductUnits() {
  const text = inject(STOREFRONT_TEXT).catalog.units;
  const common = inject(SHARED_TEXT);
  const units = common.units;
  const packing = common.packaging;
  const deployment = inject(DEPLOYMENT_CONFIG);
  const config = deployment.catalog;
  const currency = moneyFormat(deployment);

  const perUnit = (unit: string) => fillText(text.perUnit, { unit });

  return {
    /** Null where the product has no price for the unit. */
    priceRow(prices: UnitPrices, unit: ProductUnit): UnitPriceRow | null {
      const price = prices[unit];
      if (price === null) return null;
      return {
        label: perUnit(units[unit]),
        price: formatMoneyMinor(price, currency),
      };
    },

    /** Smallest first, by name alone (FR-UNIT-07): a count in one segment
     * breaks the scale; the packaging line says what they hold. */
    unitOptions(packaging: ProductPackaging): UnitOption[] {
      const sold = new Set(availableUnits(packaging));
      return PRODUCT_UNITS.map((unit) => ({
        unit,
        label: text.select[unit],
        available: sold.has(unit),
      }));
    },

    /** "4 pk × 6 pcs = 24 pcs", or the pack-only form, or null. */
    packagingSummary(packaging: ProductPackaging): string | null {
      const { piecesPerPack, packsPerBox } = packaging;
      if (piecesPerPack === null) return null;
      if (packsPerBox === null) {
        return fillText(text.packagingPerPack, {
          pieces: piecesPerPack,
          pieceUnit: units.piece,
          packUnit: units.pack,
        });
      }
      return fillText(text.packagingFormula, {
        packs: packsPerBox,
        packUnit: units.pack,
        pieces: piecesPerPack,
        pieceUnit: units.piece,
        total: piecesPerUnit(packaging, 'box') ?? 0,
      });
    },

    /** One figure in pieces, read through `unit`: 24 pieces is four packs of
     * six, so a stepper that stops at four says why in its own words. */
    minimumOrder(
      packaging: ProductPackaging,
      unit: ProductUnit = 'piece',
    ): string {
      const floor = pieceFloor(packaging);
      const quantity = unitQuantity(packaging, unit, floor) ?? floor;
      return fillText(common.quantity, {
        qty: formatUnitQuantity(quantity, currency),
        unit: units[unit],
      });
    },

    /**
     * The specifications' packaging rows (FR-UNIT-06). Shipped as several
     * boxes, the figures are totals, so the count qualifies the label ("Box
     * volume (for 2)") and the contents rows go: the packaging cannot say how
     * pieces split. The minimum is no row: it reads differently in each unit.
     */
    packagingRows(
      packaging: ProductPackaging,
      box: {
        volume: string | null;
        weight: string | null;
        count: number;
      } | null,
    ): PackagingRow[] {
      const rows: PackagingRow[] = [];
      if (!box || box.count === 1) {
        // A unit of one piece is the piece by another name.

        const contents = (label: string, count: number | null) => {
          if (count !== null && count > 1) {
            rows.push({
              label,
              value: `${formatUnitQuantity(count, currency)} ${units.piece}`,
            });
          }
        };
        contents(packing.packContains, packaging.piecesPerPack);
        contents(packing.boxContains, piecesPerUnit(packaging, 'box'));
      }
      if (!box) return rows;
      const label = (base: string) =>
        box.count > 1
          ? `${base} ${fillText(text.boxCountSuffix, { count: box.count })}`
          : base;

      if (box.volume) {
        rows.push({
          label: label(packing.boxVolume),
          value: `${formatStoredDecimal(box.volume, currency)} ${config.boxUnits.volume}`,
        });
      }
      if (box.weight) {
        rows.push({
          label: label(packing.boxWeight),
          value: `${formatStoredDecimal(box.weight, currency)} ${config.boxUnits.weight}`,
        });
      }
      return rows;
    },
  };
}
