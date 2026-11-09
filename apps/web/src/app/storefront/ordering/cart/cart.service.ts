import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

import {
  CART_NOTE_MAX,
  CatalogImage,
  correctPieces,
  exactLineTotal,
  PRODUCT_AVAILABILITIES,
  ProductAvailability,
  ProductImage,
  ProductPackaging,
  ProductUnit,
  ProductVariant,
  UnitPrices,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  CART_LINES_MAX,
  CartLine,
  CartPreview,
  CartPreviewLine,
  shipmentEstimate,
  ShipmentSummary,
} from '@b2b-catalog-platform/shared/core/ordering';
import { USER_ROLES, UserRole } from '@b2b-catalog-platform/shared/platform';

import {
  CartAddition,
  CartAddResult,
  ProductCart,
} from '../../../core/catalog/buying/product-cart';
import { readSessionHint } from '../../../platform/auth/session-hint';
import { CART_STORAGE_KEY, CART_STORAGE_VERSION } from './cart-storage';

/** A line as the browser keeps it: beyond the contract's fields, enough to draw
 * the whole row (photo, buying controls, shipment estimate) before `POST
 * /cart/preview` answers, or if it fails. `name` names a line whose product is
 * gone; `addedAt` and the last-seen figures are FR-CART-10's baseline.
 * `unitPriceMinor` is one of the chosen unit (for pieces, one minimum lot);
 * `lineTotalMinor` is what the header adds up. */
export interface CartStoredLine {
  slug: string;
  /** The lens the line is read and stepped in, never a second quantity. */
  unit: ProductUnit;
  /** The quantity, always in whole pieces. */
  pieces: number;
  note: string | null;
  name: string;
  addedAt: string;
  unitPriceMinor: number | null;
  lineTotalMinor: number | null;
  prices: UnitPrices;
  packaging: ProductPackaging;
  image: CatalogImage | null;
  /** One box unit's weight, volume and cartons, as last stated. `boxCount` is
   * null until a preview answers: not told, so the estimate is withheld. */
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number | null;
  /** Kept so the note field draws with the row. */
  noteEnabled: boolean;
  notePrompt: string | null;
  /** Whether the product was on offer at the last pricing, so a withdrawn line
   * does not show its old price until the call answers. True for older carts
   * and unpriced lines. */
  available: boolean;
  /** The last stock state (FR-STOCK-03), null where untracked; a change is news
   * (FR-CART-10). Null for older carts. */
  availability: ProductAvailability | null;
  /** The last stated tax rate (NFR-LEGAL-11), null where none is charged.
   * Absent until priced, which leaves it out of what the total names. */
  taxRate?: number | null;
  /** How many products this one is sold with (FR-SET-05), for the line's
   * marker. Zero for older carts. Only sellable counterparts count. */
  pairedCount: number;
  /** The pieces the cart is short of this product's counterparts (FR-SET-03),
   * or null. Kept so it survives a reload; the shop decides it, never this
   * code. Null for older carts and unpriced lines. */
  pairingShortPieces: number | null;
  /** What one piece is made of (FR-CAT-10), for the line's marker. Empty for
   * older carts. */
  parts: string[];
  /** Variants and their pictures (FR-CAT-13), which the line's mark opens.
   * Empty for older carts. */
  variants: ProductVariant[];
  images: ProductImage[];
}

/** The stored cart. Every summary figure is derived from the lines. */
interface StoredCart {
  version: number;
  lines: CartStoredLine[];
  /** Who the cart was last priced for, by the session hint's role (`null` a
   * guest; absent in older carts). A role, not an account: switching between
   * accounts means signing out between, which is caught (FR-CART-10). */
  pricedFor?: UserRole | null;
}

/** What happened to a line while the cart waited (FR-CART-10): one per line,
 * most consequential first. */
export type CartChangeKind =
  | 'unavailable'
  | 'out-of-stock'
  | 'back-in-stock'
  | 'quantity'
  | 'unpriced'
  | 'price';

/** A line the shop now describes differently. The figures are line totals,
 * comparable even where the unit moved. */
export interface CartChange {
  slug: string;
  name: string;
  kind: CartChangeKind;
  fromMinor: number | null;
  toMinor: number | null;
}

/** The cart (FR-CART-01/02/10), stored only in the browser; `POST
 * /cart/preview` says what it costs now. One line per slug: the unit is a lens.
 * On the server the cart is empty; the header corrects it after the first
 * render. */
@Injectable({ providedIn: 'root' })
export class CartService implements ProductCart {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly restored = this.read();
  private readonly stored = signal<CartStoredLine[]>(this.restored.lines);

  /** See `StoredCart.pricedFor`; undefined in older carts reads as the current
   * visitor. */
  private pricedFor: UserRole | null | undefined = this.restored.pricedFor;

  /** Whether priced once this visit: only the first answer describes what
   * changed while the cart waited. */
  private reported = false;

  private readonly changesState = signal<readonly CartChange[]>([]);

  /** What changed while the cart waited (FR-CART-10), reported once a visit. */
  readonly changes = this.changesState.asReadonly();

  /** Oldest line first. */
  readonly lines = this.stored.asReadonly();

  /** Lines, not pieces: what the cart page shows rows of. */
  readonly count = computed(() => this.stored().length);

  /** The priced lines' rates (NFR-LEGAL-11); an unpriced line is left out. */
  readonly taxRates = computed(() =>
    this.stored().flatMap((line) =>
      line.available && line.taxRate !== undefined ? [line.taxRate] : [],
    ),
  );

  readonly totalMinor = computed(() =>
    this.stored().reduce((sum, line) => sum + (line.lineTotalMinor ?? 0), 0),
  );

  /** False while a line is unpriced, so a partial sum never reads as the total.
   * */
  readonly totalComplete = computed(() =>
    this.stored().every((line) => line.lineTotalMinor !== null),
  );

  readonly isEmpty = computed(() => this.stored().length === 0);

  /** The shipment estimate (FR-UNIT-11), the server's arithmetic on the stored
   * figures, so it moves with the stepper. Null until every line has box
   * figures: a missing line must not weigh nothing. */
  readonly estimate = computed<ShipmentSummary | null>(() => {
    const lines = this.stored();
    if (lines.length === 0) return null;
    if (lines.some((line) => line.boxCount === null)) return null;
    return shipmentEstimate(
      lines.map((line) => ({
        packaging: line.packaging,
        // Weighed as corrected, as the total is.
        pieces: correctPieces(line.packaging, line.pieces),
        boxVolume: line.boxVolume,
        boxWeight: line.boxWeight,
        boxCount: line.boxCount ?? 1,
      })),
    );
  });

  /** Set when storage refused the cart: it works for this visit, and the page
   * says it will not survive a reload. */
  private readonly persistFailedState = signal(false);
  readonly persistFailed = this.persistFailedState.asReadonly();

  /** What `POST /cart/preview` prices. By value: folding an answer back is a
   * write, so identity would re-price forever. */
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
    // Otherwise the last tab to write wins and drops another tab's additions.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
      const restored = this.read();
      this.stored.set(restored.lines);
      this.pricedFor = restored.pricedFor;
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() =>
      window.removeEventListener('storage', onStorage),
    );
  }

  /** The product's line in any unit, so the buying controls never add it twice.
   * */
  lineFor(slug: string): CartStoredLine | undefined {
    return this.stored().find((line) => line.slug === slug);
  }

  /** Adds a line, or folds into the product's line, moving it to the new unit.
   * A note is taken only where one was typed. */
  add(addition: CartAddition): CartAddResult {
    const lines = this.stored();
    const at = lines.findIndex((line) => line.slug === addition.slug);
    if (at === -1 && lines.length >= CART_LINES_MAX) return 'full';

    const note = trimNote(addition.note);
    // Summed as pieces whatever the units. Corrected: a sum is the one quantity
    // nobody typed.
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
          boxVolume: null,
          boxWeight: null,
          boxCount: null,
          noteEnabled: addition.lineNoteEnabled,
          available: true,
          availability: addition.availability,
          notePrompt: addition.lineNotePrompt,
          pairedCount: addition.pairedCount,
          parts: addition.parts,
          variants: addition.variants,
          images: addition.images,
          // This line may change the pairing answer: the first preview says.
          pairingShortPieces: null,
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
          available: true,
          availability: addition.availability,
          notePrompt: addition.lineNotePrompt,
          pairedCount: addition.pairedCount,
          parts: addition.parts,
          variants: addition.variants,
          images: addition.images,
          ...priceLine(addition, pieces),
        }),
      );
    }
    return 'added';
  }

  /** Sets an existing line's unit and pieces outright, re-pricing it; never
   * creates one. */
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
        available: true,
        availability: addition.availability,
        notePrompt: addition.lineNotePrompt,
        pairedCount: addition.pairedCount,
        parts: addition.parts,
        variants: addition.variants,
        images: addition.images,
        ...priceLine(addition, addition.pieces),
      }),
    );
  }

  /** Unlike `setLine`, an empty note clears it: here emptying the field is the
   * edit. */
  setNote(slug: string, note: string | null): void {
    const lines = this.stored();
    const at = lines.findIndex((line) => line.slug === slug);
    if (at === -1) return;
    const trimmed = trimNote(note);
    if (lines[at].note === trimmed) return;
    this.write(replaceAt(lines, at, { ...lines[at], note: trimmed }));
  }

  /** By slug alone: the caller may hold a unit the line has since left. */
  remove(slug: string): void {
    this.write(this.stored().filter((line) => line.slug !== slug));
  }

  clear(): void {
    this.write([]);
  }

  /** True where the stored prices were quoted to a different visitor
   * (`CartRepricing`). A method: the session hint is a cookie, and nothing
   * reactive fires on it. */
  needsRepricing(): boolean {
    return this.stored().length > 0 && this.pricedFor !== this.currentRole();
  }

  dismissChanges(): void {
    this.changesState.set([]);
  }

  /** Folds a preview onto the stored cart. Never removes a line: that is the
   * customer's action. The visit's first answer reports what changed (FR-
   * CART-10) while the baseline still exists. */
  applyPreview(preview: CartPreview): void {
    // By slug alone: a repacked product answers in pieces, and a unit in the
    // key would drop the correction.
    const priced = new Map(preview.lines.map((line) => [line.slug, line]));
    const current = this.stored();
    const changes: CartChange[] = [];
    const next = current.map((line) => {
      const fresh = priced.get(line.slug);
      if (!fresh) return line;
      const change = changeFor(line, fresh);
      if (change) changes.push(change);
      const updated: CartStoredLine = {
        ...line,
        unit: fresh.unit,
        pieces: fresh.pieces,
        note: fresh.note,
        name: fresh.name ?? line.name,
        // An unavailable product answers null; the last figures still draw the
        // controls.
        prices: fresh.prices ?? line.prices,
        packaging: fresh.packaging ?? line.packaging,
        image: fresh.image ?? line.image,
        // Kept for the estimate, as the prices are.
        boxVolume: fresh.boxCount === null ? line.boxVolume : fresh.boxVolume,
        boxWeight: fresh.boxCount === null ? line.boxWeight : fresh.boxWeight,
        boxCount: fresh.boxCount ?? line.boxCount,
        noteEnabled: fresh.lineNoteEnabled,
        notePrompt: fresh.lineNotePrompt,
        pairedCount: fresh.pairedCount,
        // Kept where the product is gone.
        parts: fresh.name === null ? line.parts : fresh.parts,
        variants: fresh.name === null ? line.variants : fresh.variants,
        images: fresh.name === null ? line.images : fresh.images,
        // Taken as answered: an unavailable line is short of nothing.
        pairingShortPieces: fresh.pairingShortPieces,
        // Unstated prices are a product no longer offered.
        available: fresh.prices !== null,
        availability: fresh.availability,
        taxRate: fresh.taxRate,
        unitPriceMinor:
          fresh.prices === null ? null : unitPriceOf(fresh.prices, fresh.unit),
        lineTotalMinor: fresh.lineTotalMinor,
      };
      // The same object where nothing moved, so a confirmation is no change.
      return sameLine(line, updated) ? line : updated;
    });
    this.report(changes);

    // Storage is written only on change, or where the priced-for visitor moved.
    const rebaselined = this.pricedFor !== this.currentRole();
    if (next.some((line, at) => line !== current[at])) this.write(next);
    else if (rebaselined) this.persist();
  }

  /** Silent where the cart was priced for somebody else: signing in or out re-
   * prices everything, which FR-CART-10 says is not news. */
  private report(changes: CartChange[]): void {
    const rebaselined =
      this.pricedFor !== undefined && this.pricedFor !== this.currentRole();
    if (!this.reported && !rebaselined) this.changesState.set(changes);
    this.reported = true;
  }

  /** From the readable hint beside the httpOnly session cookie. */
  private currentRole(): UserRole | null {
    return this.isBrowser ? readSessionHint(this.document.cookie) : null;
  }

  private write(lines: CartStoredLine[]): void {
    this.stored.set(lines);
    this.persist();
  }

  /** Every write states prices quoted to this visitor, so it records them. */
  private persist(): void {
    if (!this.isBrowser) return;
    this.pricedFor = this.currentRole();
    try {
      const payload: StoredCart = {
        version: CART_STORAGE_VERSION,
        lines: this.stored(),
        pricedFor: this.pricedFor,
      };
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
      this.persistFailedState.set(false);
    } catch {
      this.persistFailedState.set(true);
    }
  }

  /** Unreadable means discarded whole; each line is shape-checked, as the
   * payload is hand-editable. */
  private read(): { lines: CartStoredLine[]; pricedFor?: UserRole | null } {
    if (!this.isBrowser) return { lines: [] };
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return { lines: [] };
      const parsed = JSON.parse(raw) as StoredCart | null;
      if (
        parsed?.version !== CART_STORAGE_VERSION ||
        !Array.isArray(parsed.lines)
      ) {
        return { lines: [] };
      }
      return {
        lines: parsed.lines
          .map(withAvailability)
          .map(withStockState)
          .map(withPairedCount)
          .map(withPairingShortfall)
          .map(withParts)
          .map(withVariants)
          .filter(isStoredLine)
          .slice(0, CART_LINES_MAX),
        pricedFor: readPricedFor(parsed.pricedFor),
      };
    } catch {
      return { lines: [] };
    }
  }
}

/** A line's news from its fresh price, or null. Most consequential first: a
 * withdrawn product is not also a price change. A line priced for the first
 * time is no news. */
function changeFor(
  line: CartStoredLine,
  fresh: CartPreviewLine,
): CartChange | null {
  const change = {
    slug: line.slug,
    name: line.name,
    fromMinor: line.lineTotalMinor,
    toMinor: fresh.lineTotalMinor,
  };
  if (fresh.issues.includes('unavailable')) {
    return { ...change, kind: 'unavailable' };
  }
  // Stock emptied or refilled (FR-STOCK-04) before quantity and price: whether
  // at all before how much. "Few left" restricts nothing.
  if (fresh.availability === 'out' && line.availability !== 'out') {
    return { ...change, kind: 'out-of-stock' };
  }
  if (line.availability === 'out' && fresh.availability !== 'out') {
    return { ...change, kind: 'back-in-stock' };
  }
  if (fresh.pieces !== line.pieces) return { ...change, kind: 'quantity' };
  if (line.lineTotalMinor === null) return null;
  if (fresh.lineTotalMinor === null) return { ...change, kind: 'unpriced' };
  return fresh.lineTotalMinor === line.lineTotalMinor
    ? null
    : { ...change, kind: 'price' };
}

/** Undefined where absent or not a role: the payload is hand-editable. */
function readPricedFor(value: unknown): UserRole | null | undefined {
  if (value === null) return null;
  return (USER_ROLES as readonly unknown[]).includes(value)
    ? (value as UserRole)
    : undefined;
}

/** Fills in older lines: they were on offer when added. */
function withAvailability(line: unknown): unknown {
  const candidate = line as { available?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return typeof candidate.available === 'boolean'
    ? candidate
    : { ...candidate, available: true };
}

/** Fills in older lines as untracked, reporting nothing until priced. */
function withStockState(line: unknown): unknown {
  const candidate = line as { availability?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return 'availability' in candidate
    ? candidate
    : { ...candidate, availability: null };
}

/** Fills in older lines as no marker. */
function withPairedCount(line: unknown): unknown {
  const candidate = line as { pairedCount?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return typeof candidate.pairedCount === 'number'
    ? candidate
    : { ...candidate, pairedCount: 0 };
}

/** Fills in older lines as no marker. */
function withParts(line: unknown): unknown {
  const candidate = line as { parts?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return Array.isArray(candidate.parts) &&
    candidate.parts.every((part) => typeof part === 'string')
    ? candidate
    : { ...candidate, parts: [] };
}

/** Fills in older or misshapen lines as no mark. */
function withVariants(line: unknown): unknown {
  const candidate = line as { variants?: unknown; images?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  const variants =
    Array.isArray(candidate.variants) && candidate.variants.every(isVariant)
      ? candidate.variants
      : [];
  const images =
    Array.isArray(candidate.images) && candidate.images.every(isLabeledImage)
      ? candidate.images
      : [];
  return { ...candidate, variants, images };
}

function isVariant(value: unknown): value is ProductVariant {
  const candidate = value as ProductVariant | null;
  return (
    !!candidate &&
    typeof candidate.name === 'string' &&
    typeof candidate.unavailable === 'boolean'
  );
}

function isLabeledImage(value: unknown): value is ProductImage {
  const candidate = value as ProductImage | null;
  return (
    isImage(candidate) &&
    candidate !== null &&
    (candidate.variant === null || typeof candidate.variant === 'string')
  );
}

/** Fills in older lines as unchecked, warning of nothing until priced. */
function withPairingShortfall(line: unknown): unknown {
  const candidate = line as { pairingShortPieces?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return 'pairingShortPieces' in candidate
    ? candidate
    : { ...candidate, pairingShortPieces: null };
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
    a.available === b.available &&
    a.availability === b.availability &&
    a.taxRate === b.taxRate &&
    a.pairedCount === b.pairedCount &&
    a.pairingShortPieces === b.pairingShortPieces &&
    same(a.parts, b.parts) &&
    same(a.variants, b.variants) &&
    same(a.images, b.images) &&
    a.boxVolume === b.boxVolume &&
    a.boxWeight === b.boxWeight &&
    a.boxCount === b.boxCount &&
    // By value: identity would rewrite the cart on every answer.
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

/** Trimmed, capped, and null for blank: the contract refuses an empty string.
 * */
function trimNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, CART_NOTE_MAX);
}

/** The line's two priced fields, together so neither is re-priced alone. Priced
 * from the corrected count: a line from before a rule change would otherwise
 * read as unpriceable. */
function priceLine(
  addition: CartAddition,
  pieces: number,
): Pick<CartStoredLine, 'unitPriceMinor' | 'lineTotalMinor'> {
  return {
    unitPriceMinor: unitPriceOf(addition.prices, addition.unit),
    lineTotalMinor: exactLineTotal(
      addition.prices.piece,
      correctPieces(addition.packaging, pieces),
    ),
  };
}

/** What one of a unit costs. */
function unitPriceOf(prices: UnitPrices, unit: ProductUnit): number | null {
  if (unit === 'pack') return prices.pack;
  if (unit === 'box') return prices.box;
  return prices.piece;
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
    // Nothing reads it yet: checked so a bad line cannot wait for a reader.
    typeof candidate.addedAt === 'string' &&
    // Summed on every read: a string would concatenate. Also FR-CART-10's
    // baseline.
    isNullableNumber(candidate.unitPriceMinor) &&
    isNullableNumber(candidate.lineTotalMinor) &&
    isPrices(candidate.prices) &&
    isPackaging(candidate.packaging) &&
    isImage(candidate.image) &&
    (candidate.boxVolume === null || typeof candidate.boxVolume === 'string') &&
    (candidate.boxWeight === null || typeof candidate.boxWeight === 'string') &&
    (candidate.boxCount === null || Number.isInteger(candidate.boxCount)) &&
    typeof candidate.noteEnabled === 'boolean' &&
    (candidate.notePrompt === null ||
      typeof candidate.notePrompt === 'string') &&
    typeof candidate.available === 'boolean' &&
    // Shown as a figure and counted, so no strings.
    (candidate.pairingShortPieces === null ||
      Number.isInteger(candidate.pairingShortPieces)) &&
    isAvailability(candidate.availability) &&
    (candidate.taxRate === undefined || isNullableNumber(candidate.taxRate))
  );
}

/** Reaches a badge and a tone lookup: no fourth word. */
function isAvailability(value: unknown): boolean {
  return (
    value === null ||
    (PRODUCT_AVAILABILITIES as readonly unknown[]).includes(value)
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
    typeof candidate.piece === 'number' &&
    isNullableNumber(candidate.pack) &&
    isNullableNumber(candidate.box)
  );
}

function isPackaging(packaging: unknown): packaging is ProductPackaging {
  const candidate = packaging as ProductPackaging | null;
  return (
    !!candidate &&
    isNullableNumber(candidate.piecesPerPack) &&
    isNullableNumber(candidate.packsPerBox) &&
    typeof candidate.minPieceQty === 'number'
  );
}
