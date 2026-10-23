import { seeded, shuffled } from './random';
import { load } from './simulation';
import { StockRules, stockOnNight } from './stock';

const rules: StockRules = {
  sold: { products: 2, percent: [10, 15] },
  reorderBelow: 30,
  deliveryNights: 2,
};

const products = [
  { sourceId: 'A', stockPieces: 1000 },
  { sourceId: 'B', stockPieces: 200 },
  { sourceId: 'C', stockPieces: 50 },
  { sourceId: 'D', stockPieces: 3 },
  { sourceId: 'OUT', stockPieces: 0 },
];

describe('seeded', () => {
  it('draws the same numbers from the same seed, and others from another', () => {
    const draw = (seed: string) => Array.from({ length: 5 }, seeded(seed));
    expect(draw('week:1')).toEqual(draw('week:1'));
    expect(draw('week:1')).not.toEqual(draw('week:2'));
    for (const n of draw('week:1')) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('shuffles without losing or changing the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffled(input, seeded('x'));
    expect([...result].sort()).toEqual(input);
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('stockOnNight', () => {
  const asObject = (night: number, seed = 'test') =>
    Object.fromEntries(stockOnNight(products, [], rules, seed, night));

  it('is the bundle on night 0', () => {
    expect(asObject(0)).toEqual({ A: 1000, B: 200, C: 50, D: 3, OUT: 0 });
  });

  it('is the same night however often it is computed', () => {
    expect(asObject(5)).toEqual(asObject(5));
    expect(asObject(5, 'another history')).not.toEqual(asObject(5));
  });

  it('sells a share of the drawn products each night, at least a piece', () => {
    const before = asObject(0);
    const after = asObject(1);
    const sold = Object.keys(before).filter((id) => after[id] < before[id]);
    expect(sold).toHaveLength(2);
    for (const id of sold) {
      const pieces = before[id] - after[id];
      expect(pieces).toBeGreaterThanOrEqual(
        Math.max(1, Math.round(before[id] * 0.1)),
      );
      expect(pieces).toBeLessThanOrEqual(
        Math.max(1, Math.round(before[id] * 0.15)),
      );
    }
    // Nothing rises but by a delivery.
    expect(Object.keys(before).filter((id) => after[id] > before[id])).toEqual(
      [],
    );
  });

  it('never goes below zero, and keeps a product stocked to zero out of stock', () => {
    for (let night = 0; night <= 60; night++) {
      const stock = asObject(night);
      for (const pieces of Object.values(stock)) {
        expect(pieces).toBeGreaterThanOrEqual(0);
      }
      expect(stock['OUT']).toBe(0);
    }
  });

  it('reorders below the threshold and restocks when the delivery arrives', () => {
    // One product, a piece sold every night. It first falls below 30 % of 10
    // at 2, on night 8, and is reordered then; it sells one more on night 9,
    // and night 10's delivery restores it to 10 before that night's sale.
    const single = [{ sourceId: 'X', stockPieces: 10 }];
    const sellOne: StockRules = {
      ...rules,
      sold: { products: 1, percent: [1, 1] },
    };
    const series = Array.from({ length: 13 }, (_, night) =>
      stockOnNight(single, [], sellOne, 's', night).get('X'),
    );
    expect(series).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 9, 8, 7]);
  });

  it('brings a new article in on its night with its first delivery, and not before', () => {
    const introduced = [{ sourceId: 'NEW', stockPieces: 40, night: 3 }];
    const on = (night: number) =>
      stockOnNight(products, introduced, rules, 'test', night).get('NEW');
    expect(on(2)).toBeUndefined();
    expect(on(3)).toBe(40);
    expect(on(30)).toBeGreaterThan(0);
  });
});

describe('a year of the Slaney Labware simulation', () => {
  const slaney = 'deployments/slaney-labware-ie';
  const { simulation, tracked, newProducts } = load(
    `${slaney}/seed`,
    `${slaney}/config`,
  );

  it('keeps the shop stocked: few products out, few running low, every night', () => {
    const stocked = new Map(
      [...tracked, ...newProducts].map((p) => [p.sourceId, p.stockPieces]),
    );
    let worstOut = 0;
    let worstLow = 0;
    for (let night = 1; night <= 365; night++) {
      const stock = stockOnNight(
        tracked,
        newProducts,
        simulation.catalog,
        simulation.seed,
        night,
      );
      let out = 0;
      let low = 0;
      for (const [sourceId, pieces] of stock) {
        if (pieces <= 0) out++;
        else if (pieces < (stocked.get(sourceId) ?? 0) / 4) low++;
      }
      worstOut = Math.max(worstOut, out);
      worstLow = Math.max(worstLow, low);
    }
    // The seeded out-of-stock case, plus the odd fast seller waiting for its
    // delivery.
    expect(worstOut).toBeLessThanOrEqual(4);
    expect(worstLow).toBeLessThanOrEqual(4);
  });
});
