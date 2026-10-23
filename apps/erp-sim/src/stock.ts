import { seeded, shuffled } from './random';

/** A product whose stock the back office tracks, with the quantity it is
 * stocked to: the bundle's figure, or a new article's first delivery. */
export interface TrackedProduct {
  readonly sourceId: string;
  readonly stockPieces: number;
}

/** How a night moves the stock (simulation.json's `catalog`). */
export interface StockRules {
  /** This many products in stock sell a share of what they hold… */
  readonly sold: {
    readonly products: number;
    /** …between these two percentages, drawn per product. */
    readonly percent: readonly [number, number];
  };
  /** Below this percentage of its stocked quantity a product is reordered… */
  readonly reorderBelow: number;
  /** …and the delivery arrives this many nights later, restoring it. */
  readonly deliveryNights: number;
}

/** A product the back office starts selling some nights after the reset. */
export interface Introduced extends TrackedProduct {
  /** The night it first appears in a run. */
  readonly night: number;
}

/**
 * The stock each product holds after `night` nights since the reset, for the
 * bundle's tracked products and every introduced one whose night has come.
 * Night 0 is the bundle as seeded. Each later night is drawn from a generator
 * seeded with its own number, so the result depends on nothing but its inputs
 * and a restarted simulator sends exactly what it would have sent.
 *
 * A night, in order: deliveries due that night restore their products to the
 * stocked quantity; `sold.products` products in stock sell a share of what
 * they hold, at least one piece, never below zero; products introduced that
 * night arrive with their first delivery; and every product below
 * `reorderBelow` percent of its stocked quantity, with nothing on order, is
 * reordered for `deliveryNights` later. A product stocked to zero is never
 * reordered — it is the bundle's out-of-stock case and stays one. While a
 * delivery is on its way a product keeps selling, so a fast seller can run
 * dry for a night or two, as in any shop.
 */
export function stockOnNight(
  products: readonly TrackedProduct[],
  introduced: readonly Introduced[],
  rules: StockRules,
  seed: string,
  night: number,
): Map<string, number> {
  const stocked = new Map(products.map((p) => [p.sourceId, p.stockPieces]));
  const stock = new Map(stocked);
  const due = new Map<string, number>();

  for (let n = 1; n <= night; n++) {
    const next = seeded(`${seed}:${n}`);

    for (const [sourceId, deliveryNight] of due) {
      if (deliveryNight !== n) continue;
      stock.set(sourceId, stocked.get(sourceId) ?? 0);
      due.delete(sourceId);
    }

    const inStock = shuffled(
      [...stock.keys()].filter((id) => (stock.get(id) ?? 0) > 0),
      next,
    );
    const [low, high] = rules.sold.percent;
    for (const sourceId of inStock.slice(0, rules.sold.products)) {
      const pieces = stock.get(sourceId) ?? 0;
      const percent = low + next() * (high - low);
      const sold = Math.max(1, Math.round((pieces * percent) / 100));
      stock.set(sourceId, Math.max(0, pieces - sold));
    }

    for (const product of introduced) {
      if (product.night !== n) continue;
      stocked.set(product.sourceId, product.stockPieces);
      stock.set(product.sourceId, product.stockPieces);
    }

    for (const [sourceId, quantity] of stocked) {
      if (quantity <= 0 || due.has(sourceId)) continue;
      if ((stock.get(sourceId) ?? 0) < (quantity * rules.reorderBelow) / 100) {
        due.set(sourceId, n + rules.deliveryNights);
      }
    }
  }
  return stock;
}
