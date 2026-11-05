import { Client } from 'pg';

/** A product's price in the storefront's list: a `product_prices` row, a
 * second insert, the list found by its badge, as deployments rename keys. */
export async function priceProduct(
  client: Client,
  sourceId: string,
  priceMinor: number,
): Promise<void> {
  await client.query(
    `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
     SELECT p.id, t.id, $2
       FROM products p, customer_tiers t
      WHERE p."sourceId" = $1 AND t."isDefault"
     ON CONFLICT ("productId", "tierId") DO UPDATE
       SET "priceMinor" = EXCLUDED."priceMinor"`,
    [sourceId, priceMinor],
  );
}

/** What the storefront quotes for one product, or null where nothing does. */
export async function priceOf(
  client: Client,
  sourceId: string,
): Promise<number | null> {
  const { rows } = await client.query<{ priceMinor: number }>(
    `SELECT pp."priceMinor"
       FROM products p
       JOIN customer_tiers t ON t."isDefault"
       JOIN product_prices pp
         ON pp."productId" = p.id AND pp."tierId" = t.id
      WHERE p."sourceId" = $1`,
    [sourceId],
  );
  return rows[0]?.priceMinor ?? null;
}

/** The badged list's id, fetched once for a fixture writing several prices. */
export async function defaultTierId(client: Client): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM customer_tiers WHERE "isDefault"',
  );
  return rows[0].id;
}
