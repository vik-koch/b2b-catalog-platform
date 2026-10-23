import { readFileSync } from 'node:fs';
import * as z from 'zod';
import { Account, claimsFor } from './accounts';
import { localDate, nightsBetween } from './clock';
import { Order, stepsFor } from './orders';
import { Area, Outcome, Platform } from './platform';
import { workingHour } from './schedule';
import { load } from './simulation';
import { stockOnNight } from './stock';

/**
 * The simulated back office of a demo shop (ADR 0068): it owns the shop's
 * catalog, customers and orders and drives them through the machine API on
 * the shop's own clock, the way a real source system would. Nightly, the
 * stock; hourly in working hours, the registrations and the orders waiting
 * for it. Started by infra/reset.sh after a reset, with the moment of that
 * reset as its epoch. What it sends follows from the seed bundle,
 * simulation.json, the nights since then and what the shop's books say now —
 * it keeps nothing of its own.
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

/** How often the clock is looked at. A cycle is due at most once a night, or
 * once a working hour. */
const TICK_MS = 30_000;
/** How long a cycle that failed waits before it is tried again. */
const RETRY_MS = 10 * 60_000;

/** How each area is named when a run for it is skipped. */
const NOT_OWNED: Record<Area, string> = {
  catalog: 'the catalog is',
  customers: 'the customers are',
  orders: 'order processing is',
};

const log = (message: string) =>
  console.log(`${new Date().toISOString()} ${message}`);

async function main() {
  const {
    simulation,
    tracked,
    newProducts,
    workingHours,
    accountRules,
    timeZone,
  } = load(env.SEED_PATH, env.CONFIG_PATH);
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

  // Failures already reported, by area and cycle: the shop hears that a feed
  // broke once, not on every retry.
  const reported = new Set<string>();

  /**
   * Logs what a run came to and says whether the cycle is done with it: a run
   * the platform took, or an area the shop has taken back by hand, is done —
   * the next cycle tries again either way. Only a failure is retried, and
   * reported.
   */
  const settle = async (
    area: Area,
    cycle: string,
    label: string,
    outcome: Outcome,
    counts: (summary: Record<string, unknown>) => string,
  ): Promise<boolean> => {
    switch (outcome.kind) {
      case 'run': {
        const staged = outcome.stagedReason ? ` (${outcome.stagedReason})` : '';
        const errors = Number(outcome.summary['errors'] ?? 0);
        log(
          `${label}: ${outcome.status}${staged}, ${counts(outcome.summary)}` +
            (errors ? `, ${errors} rows refused: ${outcome.rowErrors}` : ''),
        );
        return true;
      }
      case 'not-owned':
        log(`${label}: ${NOT_OWNED[area]} not ERP-owned right now, skipped`);
        return true;
      case 'failed':
        log(`${label}: FAILED ${outcome.detail}; trying again in 10 minutes`);
        if (!reported.has(`${area} ${cycle}`)) {
          reported.add(`${area} ${cycle}`);
          await platform.reportFailure(area, outcome.detail, label);
        }
        return false;
    }
  };

  const catalog = async (night: number): Promise<boolean> => {
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
    return settle(
      'catalog',
      `night ${night}`,
      label,
      outcome,
      (summary) =>
        `${String(summary['update'] ?? 0)} products updated, ${String(summary['create'] ?? 0)} created`,
    );
  };

  /** Every registration waiting on the storefront, answered. */
  const accounts = async (hour: string): Promise<boolean> => {
    const label = `Registrations, ${hour}:00`;
    let book: Account[];
    try {
      book = await platform.readAll<Account>(
        'customers/accounts',
        'accounts',
        200,
      );
    } catch (error) {
      return settle(
        'customers',
        hour,
        label,
        {
          kind: 'failed',
          detail: String(error),
        },
        () => '',
      );
    }
    const rows = claimsFor(book, accountRules);
    if (rows.length === 0) return true;
    const outcome = await platform.submit('customers', {
      rows,
      // A claim only writes onto an account that is already here, and what it
      // sets beyond the key and the approval is the price list.
      options: {
        fields: ['tier'],
        createMissing: false,
        updateExisting: true,
        claimByEmail: false,
        claimById: true,
      },
      label,
    });
    return settle(
      'customers',
      hour,
      label,
      outcome,
      (summary) =>
        `${String(summary['claimedById'] ?? 0)} claimed and approved, ${String(summary['mailed'] ?? 0)} mailed`,
    );
  };

  /** Every open order that has waited long enough, one step on. */
  const orders = async (hour: string): Promise<boolean> => {
    const label = `Orders, ${hour}:00`;
    let book: Order[];
    try {
      book = await platform.readAll<Order>('orders', 'orders', 50);
    } catch (error) {
      return settle(
        'orders',
        hour,
        label,
        {
          kind: 'failed',
          detail: String(error),
        },
        () => '',
      );
    }
    const instructions = stepsFor(
      book,
      new Date(),
      simulation.orders.stepAfterHours,
    );
    if (instructions.length === 0) return true;
    const outcome = await platform.submit('orders', {
      orders: instructions,
      label,
    });
    return settle(
      'orders',
      hour,
      label,
      outcome,
      (summary) =>
        `${String(summary['update'] ?? 0)} orders moved, ${String(summary['mailed'] ?? 0)} customers told`,
    );
  };

  // The last night whose stock was dealt with, and the last working hour.
  let catalogNight = 0;
  let catalogRetryAt = 0;
  let workedHour: string | null = null;
  let hourRetryAt = 0;

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Also on the first tick: a night missed while the container was down
      // is sent as soon as it is back, and sending one twice changes nothing.
      const night = nightsBetween(epoch, new Date(), timeZone);
      if (night > catalogNight && Date.now() >= catalogRetryAt) {
        if (await catalog(night)) catalogNight = night;
        else catalogRetryAt = Date.now() + RETRY_MS;
      }

      // The two halves of the hour are independent: one failing does not
      // keep the other from its work, and a retry repeats both harmlessly.
      const hour = workingHour(new Date(), timeZone, workingHours);
      if (hour && hour !== workedHour && Date.now() >= hourRetryAt) {
        const accountsDone = await accounts(hour);
        const ordersDone = await orders(hour);
        if (accountsDone && ordersDone) workedHour = hour;
        else hourRetryAt = Date.now() + RETRY_MS;
      }
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
