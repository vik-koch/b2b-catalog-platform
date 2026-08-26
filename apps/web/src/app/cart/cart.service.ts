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
  CatalogImage,
  correctPieces,
  exactLineTotal,
  LineUnitPrices,
  ProductPackagingInfo,
  ProductUnit,
  shipmentEstimate,
  ShipmentSummary,
  UnitPrices,
} from '@b2b-catalog-platform/shared';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION } from './cart-storage';

/**
 * A line as the browser keeps it. Beyond what the contract needs
 * (`slug`/`unit`/`pieces`/`note`) it carries what the browser has to be able
 * to answer for itself:
 *
 * - `name`, so a line whose product has gone can still say which product it
 *   was — preview answers `null` for one, and a bare slug is not something to
 *   ask a customer to recognise.
 * - `addedAt` and the last-seen prices, which are the baseline FR-CART-10
 *   compares against on the next visit. Both are recorded from the first
 *   version that stores a cart at all: a baseline that only starts later
 *   cannot describe what changed while a cart written today waited.
 * - `prices`, `packaging` and the line's `image` as they stood when the line
 *   was last seen, which is what lets the cart page draw a whole row — photo
 *   and buying controls — from the browser alone: the unit selector and the
 *   stepper need the packaging to correct a quantity and the prices to say
 *   what the change costs, and none of it may wait for `POST /cart/preview`.
 *   A cart whose rows arrive a beat before their photos is a page that
 *   flickers on every load, and a failed preview would leave it with neither.
 * - the box figures, for the same reason one step further on: with them the
 *   browser adds up the shipment estimate itself, so what the order will weigh
 *   moves with the stepper rather than a round trip behind it.
 *
 * `unitPriceMinor` is what *one* of the chosen unit cost (for pieces, one
 * minimum lot), so a quantity change does not read as a price change;
 * `lineTotalMinor` is what the line cost, and is what the header adds up
 * without a round trip.
 */
export interface CartStoredLine {
  slug: string;
  /** The lens the line is read and stepped in — never a second quantity. */
  unit: ProductUnit;
  /** The quantity, always in whole pieces. */
  pieces: number;
  note: string | null;
  name: string;
  addedAt: string;
  unitPriceMinor: number | null;
  lineTotalMinor: number | null;
  prices: UnitPrices;
  packaging: ProductPackagingInfo;
  image: CatalogImage | null;
  /**
   * What one box unit of this product weighs and takes up, and how many
   * cartons it ships as — the last the server said, and what lets the browser
   * add up the shipment estimate itself.
   *
   * `boxCount` is null until a preview has answered for the line: a product
   * page knows nothing about cartons, so a line that has only been added has
   * not been told. Null is "not told", not "no box" — the estimate is withheld
   * rather than computed from a figure nobody stated.
   */
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number | null;
  /** Whether this line takes a note, and the product's own wording for it —
   * kept for the same reason the prices are: the cart page draws the note
   * field with the row rather than when the pricing call answers. */
  noteEnabled: boolean;
  notePrompt: string | null;
}

/** The whole cart as it is written down. Only the lines: everything the
 * summary states is derived from them. */
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
  pieces: number;
  note: string | null;
  prices: UnitPrices;
  packaging: ProductPackagingInfo;
  /** The photo the customer was looking at, so the cart can draw the line
   * before it has asked the server anything. */
  image: CatalogImage | null;
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
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
 * cart twice as pieces and as boxes — the unit is a lens on the line, and
 * changing it changes nothing but how the line reads.
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
   * The shipment estimate (FR-UNIT-11) worked out from what is written down —
   * the same arithmetic the server runs, on the same figures, so an edit moves
   * the consignment the moment it is made rather than one round trip later.
   * The summary is derived from the lines rather than stored beside them,
   * exactly as the total is; two copies of one figure disagree the moment a
   * quantity changes.
   *
   * Null until every line has been told its box figures. A cart holding one
   * line nobody has priced yet cannot be added up honestly: the missing line
   * would read as a weightless one, and a summary that quietly leaves a
   * product out is worse than a summary that has not arrived — which is when
   * the page shows its skeleton instead.
   */
  readonly estimate = computed<ShipmentSummary | null>(() => {
    const lines = this.stored();
    if (lines.length === 0) return null;
    if (lines.some((line) => line.boxCount === null)) return null;
    return shipmentEstimate(
      lines.map((line) => ({
        packaging: line.packaging,
        // Corrected for the same reason the total is: a line the shop is about
        // to correct should not be weighed as it stands.
        pieces: correctPieces(line.packaging, line.pieces),
        boxVolume: line.boxVolume,
        boxWeight: line.boxWeight,
        boxCount: line.boxCount ?? 1,
      })),
    );
  });

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
      this.stored().map(({ slug, unit, pieces, note }) => ({
        slug,
        unit,
        pieces,
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
    // Always summed, whatever unit either was chosen in: both are piece counts
    // of the same goods, so adding two packs to a line held in boxes is simply
    // twelve more pieces. Corrected, because a sum is the one quantity here
    // nobody typed — it is the only way to reach the ceiling by accident.
    const pieces =
      at === -1
        ? addition.pieces
        : correctPieces(addition.packaging, lines[at].pieces + addition.pieces);

    if (at === -1) {
      this.write([
        ...lines,
        {
          slug: addition.slug,
          unit: addition.unit,
          pieces,
          note,
          name: addition.name,
          addedAt: new Date().toISOString(),
          prices: addition.prices,
          packaging: addition.packaging,
          image: addition.image,
          // Not told yet: the first preview fills these in.
          boxVolume: null,
          boxWeight: null,
          boxCount: null,
          noteEnabled: addition.lineNoteEnabled,
          notePrompt: addition.lineNotePrompt,
          ...priceLine(addition, pieces),
        },
      ]);
    } else {
      this.write(
        replaceAt(lines, at, {
          ...lines[at],
          unit: addition.unit,
          pieces,
          note: note ?? lines[at].note,
          name: addition.name,
          prices: addition.prices,
          packaging: addition.packaging,
          image: addition.image,
          noteEnabled: addition.lineNoteEnabled,
          notePrompt: addition.lineNotePrompt,
          ...priceLine(addition, pieces),
        }),
      );
    }
    return 'added';
  }

  /**
   * Sets an existing line's unit and piece count outright, re-pricing it — what
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
        pieces: addition.pieces,
        note: trimNote(addition.note) ?? lines[at].note,
        name: addition.name,
        prices: addition.prices,
        packaging: addition.packaging,
        image: addition.image,
        noteEnabled: addition.lineNoteEnabled,
        notePrompt: addition.lineNotePrompt,
        ...priceLine(addition, addition.pieces),
      }),
    );
  }

  /**
   * Writes a line's note, or clears it. Separate from `setLine`, which takes
   * the newer note only where one was typed — that is right for an *addition*,
   * which must not erase what is already on the line, and wrong for an edit,
   * where emptying the field is the edit.
   */
  setNote(slug: string, note: string | null): void {
    const lines = this.stored();
    const at = lines.findIndex((line) => line.slug === slug);
    if (at === -1) return;
    const trimmed = trimNote(note);
    if (lines[at].note === trimmed) return;
    this.write(replaceAt(lines, at, { ...lines[at], note: trimmed }));
  }

  /** By slug alone, since that is what identifies a line — a caller holding a
   * unit the line has since been moved off would otherwise remove nothing. */
  remove(slug: string): void {
    this.write(this.stored().filter((line) => line.slug !== slug));
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
    // By slug alone, which is what identifies a line. The answer may carry
    // another unit than the one that was sent — a product repacked out of it
    // falls back to the piece — and a key holding the unit would then match
    // nothing and drop the correction on the floor.
    const priced = new Map(preview.lines.map((line) => [line.slug, line]));
    const current = this.stored();
    const next = current.map((line) => {
      const fresh = priced.get(line.slug);
      if (!fresh) return line;
      const updated: CartStoredLine = {
        ...line,
        unit: fresh.unit,
        pieces: fresh.pieces,
        note: fresh.note,
        name: fresh.name ?? line.name,
        // Kept where the answer has none: an unavailable product answers null
        // for both, and the last-known figures are what still let the line's
        // controls draw themselves.
        prices: fresh.prices ?? line.prices,
        packaging: fresh.packaging ?? line.packaging,
        image: fresh.image ?? line.image,
        // Kept where the answer has none, for the reason the prices are: an
        // unavailable product answers null for all of them, and the last
        // figures the shop stated are the ones the estimate was drawn from.
        boxVolume: fresh.boxCount === null ? line.boxVolume : fresh.boxVolume,
        boxWeight: fresh.boxCount === null ? line.boxWeight : fresh.boxWeight,
        boxCount: fresh.boxCount ?? line.boxCount,
        noteEnabled: fresh.lineNoteEnabled,
        notePrompt: fresh.lineNotePrompt,
        unitPriceMinor:
          fresh.prices === null ? null : unitPriceOf(fresh.prices, fresh.unit),
        lineTotalMinor: fresh.lineTotalMinor,
      };
      // Hand back the same object where nothing moved, so an answer that only
      // confirms the cart does not count as a change to it.
      return sameLine(line, updated) ? line : updated;
    });
    // An answer that only confirms what is written down is not a change to it,
    // so nothing here touches storage on every reply.
    if (next.some((line, at) => line !== current[at])) this.write(next);
  }

  private write(lines: CartStoredLine[]): void {
    this.stored.set(lines);
    this.persist();
  }

  private persist(): void {
    if (!this.isBrowser) return;
    try {
      const payload: StoredCart = {
        version: CART_STORAGE_VERSION,
        lines: this.stored(),
      };
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
    a.unit === b.unit &&
    a.pieces === b.pieces &&
    a.note === b.note &&
    a.name === b.name &&
    a.unitPriceMinor === b.unitPriceMinor &&
    a.lineTotalMinor === b.lineTotalMinor &&
    a.noteEnabled === b.noteEnabled &&
    a.notePrompt === b.notePrompt &&
    a.boxVolume === b.boxVolume &&
    a.boxWeight === b.boxWeight &&
    a.boxCount === b.boxCount &&
    // By value: preview hands back fresh objects every time, and comparing
    // them by identity would rewrite the whole cart on every answer.
    same(a.prices, b.prices) &&
    same(a.packaging, b.packaging) &&
    same(a.image, b.image)
  );
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

/**
 * The two priced fields of a line, from the prices the choice was made
 * against — kept together so an edit can never re-price one without the other.
 *
 * Priced from the *corrected* count. It is the line's own count in all but one
 * case: a line written down before the product's rules changed. Pricing that
 * one as it stands answers "no price", which is a state that belongs to a
 * product the shop cannot price at all, not to one whose quantity has moved.
 */
function priceLine(
  addition: CartAddition,
  pieces: number,
): Pick<CartStoredLine, 'unitPriceMinor' | 'lineTotalMinor'> {
  return {
    unitPriceMinor: unitPriceOf(addition.prices, addition.unit),
    lineTotalMinor: exactLineTotal(
      addition.prices,
      addition.packaging,
      correctPieces(addition.packaging, pieces),
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
    Number.isInteger(candidate.pieces) &&
    candidate.pieces > 0 &&
    (candidate.note === null || typeof candidate.note === 'string') &&
    typeof candidate.name === 'string' &&
    // The baseline FR-CART-10 reports against. Nothing reads it yet, which is
    // exactly why it has to be checked here: a line stored without one would
    // survive until the visit that finally compares against it.
    typeof candidate.addedAt === 'string' &&
    // Both are summed on every read — the header's total and the page's — and
    // a string among them turns the sum into concatenation rather than a
    // wrong number.
    isNullableNumber(candidate.unitPriceMinor) &&
    isNullableNumber(candidate.lineTotalMinor) &&
    isPrices(candidate.prices) &&
    isPackaging(candidate.packaging) &&
    isImage(candidate.image) &&
    (candidate.boxVolume === null || typeof candidate.boxVolume === 'string') &&
    (candidate.boxWeight === null || typeof candidate.boxWeight === 'string') &&
    (candidate.boxCount === null || Number.isInteger(candidate.boxCount)) &&
    typeof candidate.noteEnabled === 'boolean' &&
    (candidate.notePrompt === null || typeof candidate.notePrompt === 'string')
  );
}

function isImage(image: unknown): image is CatalogImage | null {
  const candidate = image as CatalogImage | null;
  return (
    candidate === null ||
    (!!candidate &&
      typeof candidate.thumb === 'string' &&
      typeof candidate.full === 'string')
  );
}

/** A number field of a hand-editable payload: the figure, or nothing. */
function isNullableNumber(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

function isPrices(prices: unknown): prices is UnitPrices {
  const candidate = prices as UnitPrices | null;
  return (
    !!candidate &&
    typeof candidate.pieceMilliMinor === 'number' &&
    isNullableNumber(candidate.pieceLotMinor) &&
    isNullableNumber(candidate.pack) &&
    isNullableNumber(candidate.box)
  );
}

function isPackaging(packaging: unknown): packaging is ProductPackagingInfo {
  const candidate = packaging as ProductPackagingInfo | null;
  return (
    !!candidate &&
    isNullableNumber(candidate.piecesPerPack) &&
    isNullableNumber(candidate.packsPerBox) &&
    typeof candidate.minPieceQty === 'number'
  );
}
