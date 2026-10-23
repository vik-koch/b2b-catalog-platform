import { readFileSync } from 'node:fs';
import * as z from 'zod';
import { localDate, nightsBetween } from './clock';
import { Platform } from './platform';
import { load } from './simulation';
import { stockOnNight } from './stock';

/**
 * The simulated back office of a demo shop (ADR 0068): it owns the shop's
 * catalog and drives it through the machine API on the shop's own clock, the
 * way a real source system would. Started by infra/reset.sh after a reset,
 * with the moment of that reset as its epoch; everything it sends follows from
 * the seed bundle, simulation.json and the nights since then.
 */
const env = z
  .object({
    // The platform's API on the stack's own network, never the public hop.
    API_URL: z.url(),
    ERP_SIM_TOKEN: z.string().min(1),
    // The seed bundle beside simulation.json: the back office's own records.
    SEED_PATH: z.string().min(1),
    // The deployment config, for the shop's time zone.
    CONFIG_PATH: z.string().min(1),
    // Written by reset.sh: the moment the shop was reset, as an ISO instant.
    SIM_EPOCH_FILE: z.string().min(1),
  })
  .parse(process.env);

/** The price list every deployment starts with, which guests see unless an
 * admin moved the badge: the one a new article's price is sent for. */
const DEFAULT_PRICE_LIST = 'default';

/** How often the clock is looked at. A cycle is due at most once a night. */
const TICK_MS = 30_000;
/** How long a cycle that failed waits before it is tried again. */
const RETRY_MS = 10 * 60_000;

const log = (message: string) =>
  console.log(`${new Date().toISOString()} ${message}`);

async function main() {
  const { simulation, tracked, newProducts, timeZone } = load(
    env.SEED_PATH,
    env.CONFIG_PATH,
  );
  const epoch = new Date(readFileSync(env.SIM_EPOCH_FILE, 'utf8').trim());
  if (Number.isNaN(epoch.getTime())) {
    throw new Error(`${env.SIM_EPOCH_FILE} holds no instant`);
  }
  const platform = new Platform(env.API_URL, env.ERP_SIM_TOKEN);
  log(
    `Simulating since ${epoch.toISOString()} in ${timeZone}: ${tracked.length} products with tracked stock, ${newProducts.length} new ones to come`,
  );

  // Loud but not fatal: a platform briefly away must not keep the back office
  // from starting, and the cycles report what they meet.
  try {
    const { name, scopes } = await platform.identify();
    log(`Token "${name}": ${scopes.join(', ')}`);
  } catch (error) {
    log(`WARNING: ${String(error)}`);
  }

  // The last night whose stock was sent, or deliberately not sent.
  let catalogNight = 0;
  let retryAt = 0;
  let reportedNight = 0;

  const catalog = async (night: number) => {
    const stock = stockOnNight(
      tracked,
      newProducts,
      simulation.catalog,
      simulation.seed,
      night,
    );
    const label = `Nightly stock, night ${night} (${localDate(new Date(), timeZone)})`;
    // Stock only for what the shop already has: its rows carry nothing else,
    // and an absent field is left alone, so every other field and every price
    // stays as the shop has it, and a product the shop hid stays hidden. A
    // new article is sent whole on every night from its own on, so one whose
    // night was missed is still created by the next run, and after that its
    // row is simply unchanged. Creating needs a name and a category the run
    // writes, hence both in `fields`.
    const outcome = await platform.submit('catalog', {
      rows: [
        ...tracked.map(({ sourceId }) => ({
          sourceId,
          stockPieces: stock.get(sourceId),
        })),
        ...newProducts
          .filter((product) => product.night <= night)
          .map((product) => ({
            sourceId: product.sourceId,
            name: product.name,
            categorySourceId: product.categorySourceId,
            categoryName: product.categoryName,
            prices: { [DEFAULT_PRICE_LIST]: product.priceMinor },
            stockPieces: stock.get(product.sourceId),
          })),
      ],
      options: {
        fields: ['name', 'category', 'stock'],
        createMissing: true,
        updateExisting: true,
        restoreReturning: false,
        createCategories: false,
      },
      label,
    });

    switch (outcome.kind) {
      case 'run': {
        const staged = outcome.stagedReason ? ` (${outcome.stagedReason})` : '';
        const errors = Number(outcome.summary['errors'] ?? 0);
        log(
          `${label}: ${outcome.status}${staged}, ${String(outcome.summary['update'] ?? 0)} products updated, ${String(outcome.summary['create'] ?? 0)} created` +
            (errors ? `, ${errors} rows refused: ${outcome.rowErrors}` : ''),
        );
        catalogNight = night;
        return;
      }
      case 'not-owned':
        // The shop took the catalog back by hand. Not a failure: the next
        // night tries again, and sends that night's stock if it is ours again.
        log(`${label}: the catalog is not ERP-owned right now, skipped`);
        catalogNight = night;
        return;
      case 'failed':
        log(`${label}: FAILED ${outcome.detail}; trying again in 10 minutes`);
        retryAt = Date.now() + RETRY_MS;
        // Once a night: the shop hears the feed broke, not every retry.
        if (reportedNight !== night) {
          reportedNight = night;
          await platform.reportFailure('catalog', outcome.detail, label);
        }
    }
  };

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Also on the first tick: a night missed while the container was down
      // is sent as soon as it is back, and sending one twice changes nothing.
      const night = nightsBetween(epoch, new Date(), timeZone);
      if (night > catalogNight && Date.now() >= retryAt) await catalog(night);
    } catch (error) {
      log(`ERROR ${String(error)}`);
    } finally {
      busy = false;
    }
  };

  await tick();
  setInterval(() => void tick(), TICK_MS);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
