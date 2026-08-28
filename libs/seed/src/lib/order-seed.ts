import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  ProductPackaging,
  shipmentEstimate,
  totalMinor,
  unitQuantity,
} from '@b2b-catalog-platform/shared';
import { wholesaleTier } from './account-data';
import {
  addressSeeds,
  orderSeeds,
  pickupSnapshots,
  type OrderLineSeed,
  type OrderSeed,
} from './order-data';

/** The currency the demo prices in, snapshotted onto every order it seeds. */
const CURRENCY = 'EUR';

/**
 * Saved addresses and placed orders for the demo.
 *
 * **Create-if-missing, like the accounts** — and for the same reason twice
 * over: an order is an event, so a re-seed must never mint a second copy of
 * one, and an address a demo visitor edited is theirs to have edited. Orders
 * key on their unique `reference`; addresses, which have no natural key, on the
 * account plus the street line.
 *
 * Every figure is derived from the catalog as seeded rather than written out —
 * a line total, the piece price's basis, the shipment estimate — so the demo
 * orders stay consistent with the prices the storefront is showing.
 */
export async function seedOrders(client: Client): Promise<void> {
  for (const [email, addresses] of Object.entries(addressSeeds)) {
    for (const address of addresses) {
      await client.query(
        // Casts throughout: an untyped parameter in a SELECT list is inferred
        // `text`, and the same one compared against a varchar column then
        // conflicts with itself.
        `INSERT INTO addresses ("userId", label, street, street2, "postalCode", city, country)
         SELECT u.id, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::varchar
           FROM users u
          WHERE u.email = $1
            AND NOT EXISTS (
              SELECT 1 FROM addresses a
               WHERE a."userId" = u.id AND a.street = $3::varchar)`,
        [
          email,
          address.label ?? null,
          address.street,
          address.street2 ?? null,
          address.postalCode,
          address.city,
          address.country,
        ],
      );
    }
  }

  for (const order of orderSeeds) await insertOrder(client, order);
}

interface ProductRow {
  id: string;
  sourceId: string;
  slug: string;
  name: string;
  thumbnail: string | null;
  defaultPriceMinor: number;
  tierPriceMinor: number | null;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
  priceBasisPieces: number;
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
}

const packagingOf = (row: ProductRow): ProductPackaging => ({
  piecesPerPack: row.piecesPerPack,
  packsPerBox: row.packsPerBox,
  minPieceQty: row.minPieceQty,
});

async function insertOrder(client: Client, order: OrderSeed): Promise<void> {
  const { rows: existing } = await client.query(
    'SELECT 1 FROM orders WHERE reference = $1',
    [order.reference],
  );
  if (existing.length > 0) return;

  const account = order.email ? await accountOf(client, order.email) : null;
  // A guest order has no account and so no price list; an account's own tier is
  // what its lines were priced from, exactly as checkout resolved them.
  const tierKey = account?.tierKey ?? null;
  const rows = await productRows(client, order.lines, tierKey);

  const items = order.lines.map((line, index) => {
    const row = rows.get(line.sourceId);
    if (!row) throw new Error(`order ${order.reference}: no ${line.sourceId}`);
    const packaging = packagingOf(row);
    const priceMinor = row.tierPriceMinor ?? row.defaultPriceMinor;
    const lineTotalMinor = totalMinor(
      priceMinor,
      row.priceBasisPieces,
      line.pieces,
    );
    const quantity = unitQuantity(packaging, line.unit, line.pieces);
    // Both are null only where a fixture buys a quantity or a unit the product's
    // own rules refuse — which is a broken fixture, not a runtime case.
    if (lineTotalMinor === null || quantity === null) {
      throw new Error(
        `order ${order.reference}: ${line.sourceId} cannot be bought as ` +
          `${line.pieces} pieces in ${line.unit}`,
      );
    }
    return { line, row, index, priceMinor, lineTotalMinor, quantity };
  });

  const shipment = shipmentEstimate(
    items.map(({ line, row }) => ({
      packaging: packagingOf(row),
      pieces: line.pieces,
      boxVolume: row.boxVolume,
      boxWeight: row.boxWeight,
      boxCount: row.boxCount,
    })),
  );
  const total = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const pickup = order.pickupKey ? pickupSnapshots[order.pickupKey] : null;

  const { rows: inserted } = await client.query<{ id: string }>(
    `INSERT INTO orders (
       reference, "publicToken", "userId", status, "statusChangedAt", "statusChangedBy",
       "contactName", "contactEmail", "contactPhone", "paymentMethod", "fulfilmentMethod",
       "partyName", "partyRegistrationId",
       "billingStreet", "billingStreet2", "billingPostalCode", "billingCity", "billingCountry",
       "deliveryStreet", "deliveryStreet2", "deliveryPostalCode", "deliveryCity", "deliveryCountry",
       "deliveryZoneKey", "deliveryFreeFromMinor",
       "pickupLocationKey", "pickupLocationName", "pickupLocationAddress",
       "preferredDate", "customerNote", "totalMinor",
       "shipmentCartons", "shipmentVolume", "shipmentWeight",
       "shipmentApproximate", "shipmentUncoveredLines",
       currency, "tierKey", "createdAt")
     VALUES (
       $1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, $18,
       $19, $20, $21, $22, $23, $24, $25,
       $26, $27, $28, $29, $30, $31,
       $32, $33, $34, $35, $36, $37, $38, $5::timestamptz)
     RETURNING id`,
    [
      order.reference,
      // Regenerated per insert and never re-run: the order it belongs to is
      // only ever written once.
      randomBytes(24).toString('base64url'),
      account?.id ?? null,
      order.status,
      `${order.placedOn}T09:00:00+02:00`,
      // Whoever decided is not recorded here: the demo's statuses are fixtures,
      // and naming a manager who never opened the order would be a lie the
      // order-processing iteration then has to keep telling.
      null,
      order.contactName,
      order.contactEmail,
      order.contactPhone,
      order.paymentMethod,
      order.delivery ? 'delivery' : 'pickup',
      order.partyName,
      order.partyRegistrationId,
      order.billing.street,
      order.billing.street2 ?? null,
      order.billing.postalCode,
      order.billing.city,
      order.billing.country,
      order.delivery?.street ?? null,
      order.delivery?.street2 ?? null,
      order.delivery?.postalCode ?? null,
      order.delivery?.city ?? null,
      order.delivery?.country ?? null,
      order.delivery?.zoneKey ?? null,
      order.delivery?.freeFromMinor ?? null,
      order.pickupKey ?? null,
      pickup?.name ?? null,
      pickup?.address ?? null,
      order.preferredDate ?? null,
      order.customerNote ?? null,
      total,
      shipment.cartons,
      shipment.volume,
      shipment.weight,
      shipment.approximate,
      shipment.uncoveredLines,
      CURRENCY,
      tierKey,
    ],
  );

  for (const item of items) {
    await client.query(
      `INSERT INTO order_items (
         "orderId", "sortOrder", "productId", "productSourceId", slug, name, thumbnail,
         unit, quantity, pieces, "priceMinor", "priceBasisPieces", "lineTotalMinor", note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        inserted[0].id,
        item.index,
        item.row.id,
        item.row.sourceId,
        item.row.slug,
        item.row.name,
        item.row.thumbnail,
        item.line.unit,
        item.quantity,
        item.line.pieces,
        item.priceMinor,
        item.row.priceBasisPieces,
        item.lineTotalMinor,
        item.line.note ?? null,
      ],
    );
  }
}

/** The account behind an order, and the price list it buys from. */
async function accountOf(
  client: Client,
  email: string,
): Promise<{ id: string; tierKey: string | null } | null> {
  const { rows } = await client.query<{ id: string; tierId: string | null }>(
    'SELECT id, "tierId" FROM users WHERE email = $1',
    [email],
  );
  if (rows.length === 0) return null;
  return { id: rows[0].id, tierKey: rows[0].tierId ? wholesaleTier.key : null };
}

/** Every product an order names, with the price its buyer's tier resolves to. */
async function productRows(
  client: Client,
  lines: OrderLineSeed[],
  tierKey: string | null,
): Promise<Map<string, ProductRow>> {
  const { rows } = await client.query<ProductRow>(
    `SELECT p.id, p."sourceId", p.slug, p.name,
            p.images->0->>'thumb' AS thumbnail,
            p."defaultPriceMinor",
            pp."priceMinor" AS "tierPriceMinor",
            p."piecesPerPack", p."packsPerBox", p."minPieceQty", p."priceBasisPieces",
            p."boxVolume", p."boxWeight", p."boxCount"
       FROM products p
       LEFT JOIN customer_tiers t ON t.key = $2
       LEFT JOIN product_prices pp ON pp."productId" = p.id AND pp."tierId" = t.id
      WHERE p."sourceId" = ANY($1)`,
    [lines.map((line) => line.sourceId), tierKey],
  );
  return new Map(rows.map((row) => [row.sourceId, row]));
}
