import { inject } from '@angular/core';
import {
  ProductPackagingInfo,
  UnitPrices,
  piecesPerUnit,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
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

  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce(
      // Split/join rather than replaceAll: a placeholder can appear twice (the
      // formula names the piece unit on both sides of the `=`).
      (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
      template,
    );

  const perUnit = (unit: string) => fill(text.perUnit, { unit });

  return {
    /** Every unit the product is sold in, cheapest unit first. */
    priceRows(prices: UnitPrices): UnitPriceRow[] {
      const rows: UnitPriceRow[] = [
        {
          label: perUnit(text.piece),
          price: formatPiecePrice(prices.pieceMilliMinor, currency),
        },
      ];
      if (prices.pack !== null) {
        rows.push({
          label: perUnit(text.pack),
          price: formatPriceMinor(prices.pack, currency),
        });
      }
      if (prices.box !== null) {
        rows.push({
          label: perUnit(text.box),
          price: formatPriceMinor(prices.box, currency),
        });
      }
      return rows;
    },

    /** "4 pk × 6 pcs = 24 pcs", or the pack-only form, or null. */
    packagingSummary(packaging: ProductPackagingInfo): string | null {
      const { piecesPerPack, packsPerBox } = packaging;
      if (piecesPerPack === null) return null;
      if (packsPerBox === null) {
        return fill(text.packagingPerPack, {
          pieces: piecesPerPack,
          pieceUnit: text.piece,
          packUnit: text.pack,
        });
      }
      return fill(text.packagingFormula, {
        packs: packsPerBox,
        packUnit: text.pack,
        pieces: piecesPerPack,
        pieceUnit: text.piece,
        total: piecesPerUnit(packaging, 'box') ?? 0,
      });
    },

    /** The minimum, worded, or null where there is no rule to state. */
    minimumOrder(packaging: ProductPackagingInfo): string | null {
      if (packaging.minPieceQty <= 1) return null;
      return fill(text.minQuantityValue, {
        qty: packaging.minPieceQty,
        unit: text.piece,
      });
    },

    /**
     * The minimum as a grid states it: always for a product sold in packs, even
     * where it is a single piece and says nothing. Redundant on its own, but it
     * keeps every packaged tile the same three lines tall, and a card that
     * changes height by whether a fact applies reads as broken.
     *
     * A product sold only by the piece has no packaging line to line up with,
     * so it falls back to stating a minimum only when there is one.
     */
    packagedMinimum(packaging: ProductPackagingInfo): string | null {
      if (packaging.piecesPerPack === null) return this.minimumOrder(packaging);
      return fill(text.minQuantityValue, {
        qty: packaging.minPieceQty,
        unit: text.piece,
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
          ? `${base} ${fill(text.boxCountSuffix, { count: box.count })}`
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
