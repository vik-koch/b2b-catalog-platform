import { formatPriceMinorShort } from '../catalog/price';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { cartShellSource } from './cart-shell.server';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION } from './cart-storage';

const currency = defaultDeploymentConfig.catalog.currency;

/** One stored line, reduced to the two fields the pre-paint script reads. */
function seed(...totals: (number | null)[]): void {
  localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({
      version: CART_STORAGE_VERSION,
      lines: totals.map((lineTotalMinor) => ({
        slug: 'espresso-roast',
        unit: 'piece',
        pieces: 1,
        note: null,
        name: 'Espresso Roast',
        addedAt: '2026-08-25T00:00:00.000Z',
        unitPriceMinor: lineTotalMinor,
        lineTotalMinor,
      })),
    }),
  );
}

/** Intl separates a currency with a non-breaking space, which nothing in a
 * spec should have to spell out. */
function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Runs the script the server injects, against whatever is in localStorage. */
function run(): { count: string; total: string } | null {
  const root = document.documentElement;
  root.classList.remove('cart-filled');
  root.style.removeProperty('--cart-count');
  root.style.removeProperty('--cart-total');
  new Function(cartShellSource(currency.locale, currency.code))();
  return root.classList.contains('cart-filled')
    ? {
        count: JSON.parse(root.style.getPropertyValue('--cart-count')),
        total: normalize(
          JSON.parse(root.style.getPropertyValue('--cart-total')),
        ),
      }
    : null;
}

/**
 * The script formats the total a second time, in plain ES5, because it runs
 * before any of the app exists. These are what hold it to the same answer
 * `formatPriceMinorShort` gives — a disagreement would show as the navbar
 * total changing the moment Angular boots, which is the flicker the script is
 * there to remove.
 */
describe('the pre-paint cart script', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => run());

  it('counts the stored lines and totals them', () => {
    seed(2500, 1250);

    // Cents are dropped, here as in the app: the navbar's figure is a glance.
    expect(run()).toEqual({ count: '2', total: '38 €' });
  });

  it('formats a whole total the way the app does', () => {
    seed(2000);

    expect(run()?.total).toBe(normalize(formatPriceMinorShort(2000, currency)));
  });

  it('rounds a fractional total the way the app does', () => {
    seed(1234, 87);

    expect(run()?.total).toBe(normalize(formatPriceMinorShort(1321, currency)));
  });

  // The cart page explains the missing figure; the navbar shows what the rest
  // of it costs, which is what the app does with the same cart.
  it('skips a line that has no price, as the app does', () => {
    seed(1250, null);

    expect(run()).toEqual({ count: '2', total: '13 €' });
  });

  it('leaves the navbar alone when there is no cart to read', () => {
    expect(run()).toBeNull();
  });

  it('leaves the navbar alone when the stored cart is empty', () => {
    seed();

    expect(run()).toBeNull();
  });

  // A hand-edited or half-written payload must not take the navbar down with
  // it: Angular corrects the figures a moment later either way.
  it('swallows a payload it cannot read', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{not json');

    expect(run()).toBeNull();
  });

  it('ignores a cart written by a version it does not know', () => {
    seed(1250);
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{}');
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ ...stored, version: CART_STORAGE_VERSION + 1 }),
    );

    expect(run()).toBeNull();
  });
});
