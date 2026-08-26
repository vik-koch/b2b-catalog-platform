import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { priceCart } from './cart-pricing';

/**
 * A drizzle stand-in for the one select the pricer runs. It also records the
 * rendered SQL, so the visibility gate can be asserted rather than assumed —
 * a cart that prices an unpublished product is the whole trap here.
 */
function dbWith(rows: unknown[]) {
  const sql: string[] = [];
  const chain = {
    from: () => chain,
    where(condition: unknown) {
      sql.push(rendered(condition));
      return Promise.resolve(rows);
    },
  };
  const db = { select: () => chain } as unknown as NodePgDatabase<
    typeof schema
  >;
  return { db, sql };
}

function rendered(condition: unknown): string {
  // drizzle's own renderer, so the assertion reads the SQL the database gets.
  const { PgDialect } = jest.requireActual('drizzle-orm/pg-core');
  return new PgDialect().sqlToQuery(condition as never).sql;
}

/** €19.99 per ten pieces: no piece has an exact price, every lot does. */
const coffee = {
  id: 'product-1',
  slug: 'hafen-espresso',
  name: 'Hafen Espresso',
  sourceId: 'ERP-1',
  priceMinor: 1999,
  images: [{ full: '/media/a.jpg', thumb: '/media/a-thumb.jpg' }],
  boxVolume: '0.240',
  boxWeight: '12.500',
  boxCount: 1,
  lineNoteEnabled: true,
  priceBasisPieces: 10,
  piecesPerPack: 10,
  packsPerBox: 4,
  minPieceQty: 10,
};

describe('priceCart', () => {
  it('prices a pack line exactly and keeps the basis out of the preview', async () => {
    const { db } = dbWith([coffee]);

    const { preview, lines } = await priceCart(
      db,
      [{ slug: 'hafen-espresso', unit: 'pack', quantity: 3 }],
      null,
    );

    expect(preview.lines[0].lineTotalMinor).toBe(5997);
    expect(preview.totalMinor).toBe(5997);
    expect(preview.complete).toBe(true);
    expect(preview.lines[0].issues).toEqual([]);
    expect(JSON.stringify(preview)).not.toContain('priceBasisPieces');
    // The stored figures the order line needs travel beside the preview.
    expect(lines[0].row).toMatchObject({
      productId: 'product-1',
      sourceId: 'ERP-1',
      priceMinor: 1999,
      priceBasisPieces: 10,
      pieces: 30,
    });
  });

  it('never multiplies the per-piece display figure', async () => {
    const { db } = dbWith([coffee]);

    const { preview } = await priceCart(
      db,
      [{ slug: 'hafen-espresso', unit: 'piece', quantity: 30 }],
      null,
    );

    // 199.9 minor per piece rounded and multiplied would be 6000.
    expect(preview.lines[0].lineTotalMinor).toBe(5997);
  });

  it('corrects a below-minimum piece quantity before pricing it', async () => {
    const { db } = dbWith([coffee]);

    const { preview } = await priceCart(
      db,
      [{ slug: 'hafen-espresso', unit: 'piece', quantity: 4 }],
      null,
    );

    expect(preview.lines[0]).toMatchObject({
      quantity: 10,
      issues: ['quantity-corrected'],
      lineTotalMinor: 1999,
    });
  });

  it('answers one code for a product that is gone, whichever way it is gone', async () => {
    // The query returns nothing for soft-deleted, unpublished and
    // never-existed alike — the pricer cannot tell them apart, which is the
    // point: preview must not enumerate the unpublished catalog by difference.
    const { db } = dbWith([]);

    const { preview, lines } = await priceCart(
      db,
      [{ slug: 'ghost', unit: 'pack', quantity: 1 }],
      null,
    );

    expect(preview.lines[0]).toMatchObject({
      slug: 'ghost',
      name: null,
      prices: null,
      lineTotalMinor: null,
      issues: ['unavailable'],
    });
    expect(preview.complete).toBe(false);
    expect(lines[0].row).toBeNull();
  });

  it('reads only live, published products', async () => {
    const { db, sql } = dbWith([coffee]);

    await priceCart(
      db,
      [{ slug: 'hafen-espresso', unit: 'pack', quantity: 1 }],
      null,
    );

    expect(sql[0]).toContain('"deletedAt" is null');
    expect(sql[0]).toContain('"publishedAt" is not null');
  });

  it('flags a unit the product is not sold in without dropping the line', async () => {
    const { db } = dbWith([
      { ...coffee, piecesPerPack: null, packsPerBox: null },
    ]);

    const { preview } = await priceCart(
      db,
      [{ slug: 'hafen-espresso', unit: 'box', quantity: 2 }],
      null,
    );

    expect(preview.lines[0].issues).toEqual(['unit-unavailable']);
    expect(preview.lines[0].lineTotalMinor).toBeNull();
    // The packaging is still returned, so the browser can offer another unit.
    expect(preview.lines[0].packaging).toMatchObject({ minPieceQty: 10 });
  });

  it('drops a note the product no longer takes, and says so', async () => {
    const { db } = dbWith([{ ...coffee, lineNoteEnabled: false }]);

    const { preview } = await priceCart(
      db,
      [
        {
          slug: 'hafen-espresso',
          unit: 'pack',
          quantity: 1,
          note: '100 in red',
        },
      ],
      null,
    );

    expect(preview.lines[0].note).toBeNull();
    expect(preview.lines[0].issues).toEqual(['note-not-allowed']);
    // Still priced: the note was the product's policy, not the customer's error.
    expect(preview.lines[0].lineTotalMinor).toBe(1999);
  });

  it('reports a price it cannot make exact rather than rounding one', async () => {
    // A repackaged product: the basis no longer divides the pack. The minimum
    // is one pack, so nothing else about the line needs correcting and the
    // price is the only thing wrong with it.
    const { db } = dbWith([
      { ...coffee, piecesPerPack: 7, minPieceQty: 7, packsPerBox: null },
    ]);

    const { preview, lines } = await priceCart(
      db,
      [{ slug: 'hafen-espresso', unit: 'pack', quantity: 1 }],
      null,
    );

    expect(preview.lines[0].lineTotalMinor).toBeNull();
    expect(preview.lines[0].issues).toEqual(['price-unavailable']);
    expect(preview.complete).toBe(false);
    expect(lines[0].row).toBeNull();
  });

  it('sums the shipment across the orderable lines only', async () => {
    const { db } = dbWith([coffee]);

    const { preview } = await priceCart(
      db,
      [
        { slug: 'hafen-espresso', unit: 'box', quantity: 2 },
        { slug: 'ghost', unit: 'pack', quantity: 1 },
      ],
      null,
    );

    expect(preview.shipment).toMatchObject({
      cartons: 2,
      weight: '25.000',
      coveredLines: 1,
      uncoveredLines: 0,
    });
  });

  it('asks the database nothing for an empty cart', async () => {
    const { db, sql } = dbWith([]);

    const { preview } = await priceCart(db, [], null);

    expect(sql).toEqual([]);
    expect(preview).toMatchObject({ lines: [], totalMinor: 0, complete: true });
  });
});
