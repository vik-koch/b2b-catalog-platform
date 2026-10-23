import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import { Introduced, TrackedProduct } from './stock';

/**
 * `simulation.json`, beside the seed bundle it simulates the back office of.
 * Its presence is what gives a demo stack a simulated back office at all
 * (infra/reset.sh). Strict, like the bundle: a misspelled key stops the
 * simulator at boot rather than simulating less than the author wrote.
 */
export const simulationSchema = z.strictObject({
  /** Mixed into every night's draw, so another seed is another history. */
  seed: z.string().min(1),
  catalog: z.strictObject({
    sold: z.strictObject({
      products: z.number().int().nonnegative(),
      percent: z
        .tuple([z.number().positive(), z.number().positive()])
        .refine(([low, high]) => low <= high && high <= 100, {
          message: 'a range from low to high, at most 100',
        }),
    }),
    /** Percent of a product's stocked quantity below which it is reordered. */
    reorderBelow: z.number().positive().max(100),
    deliveryNights: z.number().int().positive(),
    /** Articles the back office starts selling, one every `everyNights`, in
     * order, until the pool is used up. */
    newProducts: z.strictObject({
      everyNights: z.number().int().positive(),
      pool: z.array(
        z.strictObject({
          sourceId: z.string().min(1),
          name: z.string().min(1),
          /** A category of the bundle, by its key. */
          categoryKey: z.string().min(1),
          /** On the default price list, in minor units. */
          priceMinor: z.number().int().positive(),
          stockPieces: z.number().int().positive(),
        }),
      ),
    }),
  }),
});

export type Simulation = z.infer<typeof simulationSchema>;

/** A pool article as a run sends it, with the night it first appears. */
export interface NewProduct extends Introduced {
  readonly name: string;
  readonly categorySourceId: string;
  readonly categoryName: string;
  readonly priceMinor: number;
}

/** The parts of a seed bundle's catalog the back office needs. */
const catalogFile = z.object({
  categories: z.array(z.object({ sourceId: z.string(), name: z.string() })),
  products: z.array(
    z.object({
      sourceId: z.string(),
      stockPieces: z.number().int().optional(),
    }),
  ),
});

/** The part of the deployment config it needs: the shop's time zone. */
const deploymentFile = z.object({
  orderReference: z.object({ timezone: z.string() }).optional(),
});

export interface Loaded {
  readonly simulation: Simulation;
  /** Products with a stock figure in the bundle, in the bundle's order. */
  readonly tracked: readonly TrackedProduct[];
  /** The pool, each with its night and its category as the shop has it. */
  readonly newProducts: readonly NewProduct[];
  readonly timeZone: string;
}

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'));

/** Reads the simulation, the bundle it belongs to and the shop's time zone. */
export function load(seedPath: string, configPath: string): Loaded {
  const simulation = simulationSchema.parse(
    readJson(join(seedPath, 'simulation.json')),
  );
  const { categories, products } = catalogFile.parse(
    readJson(join(seedPath, 'catalog.json')),
  );
  const config = deploymentFile.parse(
    readJson(join(configPath, 'deployment.json')),
  );

  // A pool article names its category the way the bundle's products do. The
  // run has to send the category's own name with its key, or it would rename
  // it — so the name is the bundle's, looked up, never written twice.
  const known = new Set(products.map((p) => p.sourceId));
  const { everyNights, pool } = simulation.catalog.newProducts;
  const newProducts = pool.map((article, index): NewProduct => {
    const category = categories.find((c) => c.sourceId === article.categoryKey);
    if (!category) {
      throw new Error(
        `simulation.json: ${article.sourceId} names the category "${article.categoryKey}", which the bundle does not have`,
      );
    }
    if (known.has(article.sourceId)) {
      throw new Error(
        `simulation.json: ${article.sourceId} is already a product of the bundle`,
      );
    }
    known.add(article.sourceId);
    return {
      sourceId: article.sourceId,
      name: article.name,
      categorySourceId: category.sourceId,
      categoryName: category.name,
      priceMinor: article.priceMinor,
      stockPieces: article.stockPieces,
      night: (index + 1) * everyNights,
    };
  });

  return {
    simulation,
    tracked: products.flatMap(({ sourceId, stockPieces }) =>
      stockPieces === undefined ? [] : [{ sourceId, stockPieces }],
    ),
    newProducts,
    // Where the deployment states none, its order dates are UTC too.
    timeZone: config.orderReference?.timezone ?? 'UTC',
  };
}
