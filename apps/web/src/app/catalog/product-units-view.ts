import { inject } from '@angular/core';
import {
  PRODUCT_UNITS,
  ProductPackagingInfo,
  ProductUnit,
  UnitPrices,
  availableUnits,
  piecesPerUnit,
  unitFloor,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { fillText } from '../core/fill-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { formatPiecePrice, formatPriceMinor } from './price';

/** One priced unit, ready to render. */
export interface UnitPriceRow {
  /** "per pcs" — the unit this price covers. */
  label: string;
  price: string;
}

/** A row of the packaging block in the specifications table. */
export interface PackagingRow {
  label: string;
  value: string;
}

/** One choice in the buying block's unit selector. */
export interface UnitOption {
  unit: ProductUnit;
  /** The unit's own name, and nothing more — see `unitOptions`. */
  label: string;
  /** False where the product is not sold in this unit. The segment is still
   * shown: three units in three fixed places is what lets a grid of cards line
   * up, and a segment that answers for itself when pressed says more than a
   * missing one. */
  available: boolean;
}

/**
 * Wording for a product's units of sale, shared by the tile and the product
 * page so the two cannot describe the same product differently.
 *
 * Unit words are abbreviations that follow a number, so nothing here inflects.
 */
export function useProductUnits() {
  const text = inject(APP_TEXT).catalog.units;
  const config = inject(DEPLOYMENT_CONFIG).catalog;
  const currency = config.currency;

  const perUnit = (unit: string) => fillText(text.perUnit, { unit });

  return {
    /**
     * The price of one unit — what the selector's current choice costs, worded
     * exactly as the same unit's row in `priceRows`. Null where the product
     * carries no price for that unit, which is a state to word rather than a
     * figure to invent.
     */
    priceRow(prices: UnitPrices, unit: ProductUnit): UnitPriceRow | null {
      if (unit === 'piece') {
        return {
          label: perUnit(text.piece),
          price: formatPiecePrice(prices.pieceMilliMinor, currency),
        };
      }
      const price = unit === 'pack' ? prices.pack : prices.box;
      if (price === null) return null;
      return {
        label: perUnit(unit === 'pack' ? text.pack : text.box),
        price: formatPriceMinor(price, currency),
      };
    },

    /**
     * The units this product can be bought in, smallest first, worded for a
     * selector (FR-UNIT-07). Just the unit's name: the segments are one control
     * and have to read as a scale, which a count in one of them breaks. What a
     * pack and a box hold is stated once, below, by the packaging line.
     */
    unitOptions(packaging: ProductPackagingInfo): UnitOption[] {
      const sold = new Set(availableUnits(packaging));
      return PRODUCT_UNITS.map((unit) => ({
        unit,
        label: text.select[unit],
        available: sold.has(unit),
      }));
    },

    /** "4 pk × 6 pcs = 24 pcs", or the pack-only form, or null. */
    packagingSummary(packaging: ProductPackagingInfo): string | null {
      const { piecesPerPack, packsPerBox } = packaging;
      if (piecesPerPack === null) return null;
      if (packsPerBox === null) {
        return fillText(text.packagingPerPack, {
          pieces: piecesPerPack,
          pieceUnit: text.piece,
          packUnit: text.pack,
        });
      }
      return fillText(text.packagingFormula, {
        packs: packsPerBox,
        packUnit: text.pack,
        pieces: piecesPerPack,
        pieceUnit: text.piece,
        total: piecesPerUnit(packaging, 'box') ?? 0,
      });
    },

    /**
     * The minimum, worded — always, even where it is a single piece and states
     * no rule. One piece is the answer to the question the line asks, and a
     * line that comes and goes with the product costs more space than the
     * words in it.
     */
    /**
     * The smallest order, in `unit`. The minimum is stored once in pieces and
     * holds whichever unit it is counted in — 24 pieces is four packs of six —
     * so a stepper that stops at four says why in the same words it stops in.
     * Defaults to pieces, which is how a tile states it as a product fact.
     */
    minimumOrder(
      packaging: ProductPackagingInfo,
      unit: ProductUnit = 'piece',
    ): string {
      return fillText(text.minQuantityValue, {
        qty: unitFloor(packaging, unit) ?? packaging.minPieceQty,
        unit: text[unit],
      });
    },

    /**
     * The box rows appended to the specifications table (FR-UNIT-06): a box's
     * volume and weight. A contiguous group after the product's own attributes —
     * those describe what it is, these how it ships.
     *
     * A product shipping as several boxes does not get a row of its own for the
     * count. The figures are already the total across those boxes, so what a
     * reader needs is what each one covers: the count qualifies the label,
     * "Box volume (for 2)", and only where there is more than one.
     *
     * The packaging summary and the minimum are deliberately **not** here. Both
     * belong to buying rather than to describing: the summary makes a per-unit
     * price readable next to the unit that is being chosen, and the minimum is a
     * rule on an input that applies to piece purchases only, so a static row
     * states it wrongly whenever a pack or box is selected.
     */
    packagingRows(
      box: {
        volume: string | null;
        weight: string | null;
        count: number;
      } | null,
    ): PackagingRow[] {
      if (!box) return [];
      const label = (base: string) =>
        box.count > 1
          ? `${base} ${fillText(text.boxCountSuffix, { count: box.count })}`
          : base;

      const rows: PackagingRow[] = [];
      if (box.volume) {
        rows.push({
          label: label(text.boxVolume),
          value: `${box.volume} ${config.boxUnits.volume}`,
        });
      }
      if (box.weight) {
        rows.push({
          label: label(text.boxWeight),
          value: `${box.weight} ${config.boxUnits.weight}`,
        });
      }
      return rows;
    },
  };
}
