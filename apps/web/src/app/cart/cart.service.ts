import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  CART_LINES_MAX,
  CART_NOTE_MAX,
  CartLine,
  CartPreview,
  exactLineTotal,
  LineUnitPrices,
  ProductPackaging,
  ProductUnit,
} from '@b2b-catalog-platform/shared';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION } from './cart-storage';

/**
 * A line as the browser keeps it. Beyond what the contract needs
 * (`slug`/`unit`/`quantity`/`note`) it carries three things the server never
 * sees:
 *
 * - `name`, so a line whose product has gone can still say which product it
 *   was — preview answers `null` for one, and a bare slug is not something to
 *   ask a customer to recognise.
 * - `addedAt` and the last-seen prices, which are the baseline FR-CART-10
 *   compares against on the next visit. Both are recorded from the first
 *   version that stores a cart at all: a baseline that only starts later
 *   cannot describe what changed while a cart written today waited.
 *
 * `unitPriceMinor` is what *one* of the chosen unit cost (for pieces, one
 * minimum lot), so a quantity change does not read as a price change;
 * `lineTotalMinor` is what the line cost, and is what the header adds up
 * without a round trip.
 */
export interface CartStoredLine {
  slug: string;
  unit: ProductUnit;
  quantity: number;
  note: string | null;
  name: string;
  addedAt: string;
  unitPriceMinor: number | null;
  lineTotalMinor: number | null;
}

interface StoredCart {
  version: number;
  lines: CartStoredLine[];
}

/** What a product page hands over to record a line: the choice, plus the
 * prices it was made against so a merged quantity re-prices exactly. */
export interface CartAddition {
  slug: string;
  name: string;
  unit: ProductUnit;
  quantity: number;
  note: string | null;
  prices: LineUnitPrices;
  packaging: ProductPackaging;
}

/** `full` when the cart already holds as many lines as may be priced in one
 * call, and the addition would be one more. */
export type CartAddResult = 'added' | 'full';

/**
 * The cart (FR-CART-01/02/10). It lives entirely in the browser — there is no
 * cart table — so this service is the store, and `POST /cart/preview` only
 * says what the stored cart costs *now*.
 *
 * Identity is the `slug`: one product is one line, in whichever unit it was
 * last chosen in, and the note describes that line. A product cannot sit in the
 * cart twice as pieces and as boxes — the unit is a property of the line, and
 * changing it edits the line. Quantities are never normalized between units, so
 * four packs stay four packs even where a box holds exactly four.
 *
 * SSR-safe the way `ConsentService` is: localStorage is touched only in the
 * browser, so on the server the cart is always empty — which is what the
 * server renders, and what the header waits for `afterNextRender` to correct.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly stored = signal<CartStoredLine[]>(this.read());

  /** The cart, oldest line first. */
  readonly lines = this.stored.asReadonly();

  /** How many lines — not how many pieces. Lines are what the cart page shows
   * rows of, so they are what the header counts. */
  readonly count = computed(() => this.stored().length);

  /** The sum of the lines that had a price when last seen. */
  readonly totalMinor = computed(() =>
    this.stored().reduce((sum, line) => sum + (line.lineTotalMinor ?? 0), 0),
  );

  /** False while any line has no price, so a partial sum is never shown as the
   * whole cart's total. */
  readonly totalComplete = computed(() =>
    this.stored().every((line) => line.lineTotalMinor !== null),
  );

  readonly isEmpty = computed(() => this.stored().length === 0);

  /**
   * Set when the browser refused to store the cart — a full quota, or storage
   * disabled. The cart still works for this visit but will not survive a
   * reload, and the page says so rather than losing it in silence.
   */
  private readonly persistFailedState = signal(false);
  readonly persistFailed = this.persistFailedState.asReadonly();

  /**
   * What `POST /cart/preview` is asked to price.
   *
   * Compared by value, not by identity. Every write produces a fresh array, and
   * folding an answer back in is itself a write — so an identity comparison
   * would make a re-priced cart ask to be re-priced again, forever.
   */
  readonly request = computed<CartLine[]>(
    () =>
      this.stored().map(({ slug, unit, quantity, note }) => ({
        slug,
        unit,
        quantity,
        ...(note === null ? {} : { note }),
      })),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  constructor() {
    if (!this.isBrowser) return;
    // Without this, one tab writing the whole document makes the last writer
    // win in silence, discarding whatever another tab had added.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
      this.stored.set(this.read());
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() =>
      window.removeEventListener('storage', onStorage),
    );
  }

  /**
   * The line for a product, whatever unit it is held in — undefined where the
   * cart has none. A product is one line: the buying controls read this to
   * show what is already in the cart rather than offering to add it twice.
   */
  lineFor(slug: string): CartStoredLine | undefined {
    return this.stored().find((line) => line.slug === slug);
  }

  /**
   * Adds a line, or folds the addition into the one this product already has.
   * A product occupies one line regardless of unit: adding the same unit again
   * sums the quantities, and adding another unit moves the line to it rather
   * than splitting the product across two rows a customer has to reconcile.
   *
   * The newer note is taken only where one was typed — adding again without a
   * note does not erase the note already on the line.
   */
  add(addition: CartAddition): CartAddResult {
    const lines = this.stored();
    const at = lines.findIndex((line) => line.slug === addition.slug);
    if (at === -1 && lines.length >= CART_LINES_MAX) return 'full';

    const note = trimNote(addition.note);
    const quantity =
      at === -1 || lines[at].unit !== addition.unit
        ? addition.quantity
        : lines[at].quantity + addition.quantity;

    if (at === -1) {
      this.write([
        ...lines,
        {
          slug: addition.slug,
          unit: addition.unit,
          quantity,
          note,
          name: addition.name,
          addedAt: new Date().toISOString(),
          ...priceLine(addition, quantity),
        },
      ]);
    } else {
      this.write(
        replaceAt(lines, at, {
          ...lines[at],
          unit: addition.unit,
          quantity,
          note: note ?? lines[at].note,
          name: addition.name,
          ...priceLine(addition, quantity),
        }),
      );
    }
    return 'added';
  }

  /**
   * Sets an existing line's unit and quantity outright, re-pricing it — what
   * the buying controls do once a product is in the cart, where the stepper and
   * the unit selector edit the line itself rather than describing a new one.
   *
   * A no-op where the product is not in the cart: this edits, never creates.
   */
  setLine(addition: CartAddition): void {
    const lines = this.stored();
    const at = lines.findIndex((line) => line.slug === addition.slug);
    if (at === -1) return;
    this.write(
      replaceAt(lines, at, {
        ...lines[at],
        unit: addition.unit,
        quantity: addition.quantity,
        note: trimNote(addition.note) ?? lines[at].note,
        name: addition.name,
        ...priceLine(addition, addition.quantity),
      }),
    );
  }

  remove(slug: string, unit: ProductUnit): void {
    this.write(
      this.stored().filter(
        (line) => !(line.slug === slug && line.unit === unit),
      ),
    );
  }

  clear(): void {
    this.write([]);
  }

  /**
   * Folds a fresh preview back onto the stored cart: corrected quantities,
   * dropped notes, and the prices as they stand now.
   *
   * It never removes a line. The server flags a dead one; taking it out is the
   * customer's action, and a cart that quietly shortened itself between two
   * glances is worse than one that says what is wrong with it.
   */
  applyPreview(preview: CartPreview): void {
    const priced = new Map(
      preview.lines.map((line) => [keyOf(line.slug, line.unit), line]),
    );
    const current = this.stored();
    const next = current.map((line) => {
      const fresh = priced.get(keyOf(line.slug, line.unit));
      if (!fresh) return line;
      const updated: CartStoredLine = {
        ...line,
        quantity: fresh.quantity,
        note: fresh.note,
        name: fresh.name ?? line.name,
        unitPriceMinor:
          fresh.prices === null ? null : unitPriceOf(fresh.prices, line.unit),
        lineTotalMinor: fresh.lineTotalMinor,
      };
      // Hand back the same object where nothing moved, so an answer that only
      // confirms the cart does not count as a change to it.
      return sameLine(line, updated) ? line : updated;
    });
    if (next.some((line, at) => line !== current[at])) this.write(next);
  }

  private write(lines: CartStoredLine[]): void {
    this.stored.set(lines);
    if (!this.isBrowser) return;
    try {
      const payload: StoredCart = { version: CART_STORAGE_VERSION, lines };
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
      this.persistFailedState.set(false);
    } catch {
      this.persistFailedState.set(true);
    }
  }

  /** Anything unreadable is discarded whole, and each surviving line is
   * shape-checked: the payload is editable by hand, and a string quantity
   * would otherwise reach the contract as one. */
  private read(): CartStoredLine[] {
    if (!this.isBrowser) return [];
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as StoredCart | null;
      if (
        parsed?.version !== CART_STORAGE_VERSION ||
        !Array.isArray(parsed.lines)
      ) {
        return [];
      }
      return parsed.lines.filter(isStoredLine).slice(0, CART_LINES_MAX);
    } catch {
      return [];
    }
  }
}

function sameLine(a: CartStoredLine, b: CartStoredLine): boolean {
  return (
    a.quantity === b.quantity &&
    a.note === b.note &&
    a.name === b.name &&
    a.unitPriceMinor === b.unitPriceMinor &&
    a.lineTotalMinor === b.lineTotalMinor
  );
}

function keyOf(slug: string, unit: ProductUnit): string {
  return `${slug} ${unit}`;
}

function replaceAt<T>(items: T[], at: number, item: T): T[] {
  const next = items.slice();
  next[at] = item;
  return next;
}

/** The note as it will be stored and sent: trimmed, capped, and `null` rather
 * than empty — the contract refuses a blank string. */
function trimNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, CART_NOTE_MAX);
}

/** The two priced fields of a line, from the prices the choice was made
 * against — kept together so an edit can never re-price one without the
 * other. */
function priceLine(
  addition: CartAddition,
  quantity: number,
): Pick<CartStoredLine, 'unitPriceMinor' | 'lineTotalMinor'> {
  return {
    unitPriceMinor: unitPriceOf(addition.prices, addition.unit),
    lineTotalMinor: exactLineTotal(
      addition.prices,
      addition.packaging,
      addition.unit,
      quantity,
    ),
  };
}

/** What one of a unit costs — for pieces, one minimum lot, which is the only
 * piece figure that may be multiplied (ADR 0035). */
function unitPriceOf(prices: LineUnitPrices, unit: ProductUnit): number | null {
  if (unit === 'pack') return prices.pack;
  if (unit === 'box') return prices.box;
  return prices.pieceLotMinor;
}

function isStoredLine(line: unknown): line is CartStoredLine {
  const candidate = line as CartStoredLine | null;
  return (
    !!candidate &&
    typeof candidate.slug === 'string' &&
    candidate.slug !== '' &&
    (candidate.unit === 'piece' ||
      candidate.unit === 'pack' ||
      candidate.unit === 'box') &&
    Number.isInteger(candidate.quantity) &&
    candidate.quantity > 0 &&
    (candidate.note === null || typeof candidate.note === 'string') &&
    typeof candidate.name === 'string'
  );
}
