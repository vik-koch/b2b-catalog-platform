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
  CART_LINES_MAX,
  CART_NOTE_MAX,
  CartLine,
  CartPreview,
  CartPreviewLine,
  CatalogImage,
  correctPieces,
  exactLineTotal,
  LineUnitPrices,
  PRODUCT_AVAILABILITIES,
  ProductAvailability,
  ProductPackagingInfo,
  ProductUnit,
  shipmentEstimate,
  ShipmentSummary,
  UnitPrices,
  USER_ROLES,
  UserRole,
} from '@b2b-catalog-platform/shared';
import { readSessionHint } from '../auth/session-hint';
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
  /**
   * Whether the shop still offered this product the last time the cart was
   * priced. Written down for the same reason the prices are: the row is drawn
   * from the browser's own copy, and a withdrawn line that only remembers its
   * last price would show it again on every visit to the cart until the
   * pricing call answered — the figure the customer was told a moment ago was
   * no longer valid, back on screen.
   *
   * True for a cart written before this was recorded, and for a line nobody
   * has priced yet: the product page it was added from was offering it.
   */
  available: boolean;
  /**
   * What the shop last said about this product's stock, or null where it is
   * untracked — the badge the row wears (FR-STOCK-03), and the baseline the
   * next pricing is compared against: a line that went off the shelf while the
   * cart waited, or came back onto it, is news (FR-CART-10).
   *
   * Null for a cart written before this was recorded, which reads as untracked
   * and reports nothing until the shop says otherwise.
   */
  availability: ProductAvailability | null;
  /**
   * How many products this one is sold together with (FR-SET-05) — what the
   * marker on the cart's line is drawn from, before anything is priced.
   *
   * Zero for a cart written before this was recorded, which reads as no marker
   * until the next pricing says otherwise. Only counterparts the shop can sell
   * are counted, so a lid leaving the catalogue takes the marker off the cup's
   * line by itself.
   */
  pairedCount: number;
  /**
   * How many pieces of what this product is sold with the cart is short of
   * (FR-SET-03), or null where it is short of nothing.
   *
   * Written down for the reason the prices are: the cart is drawn from the
   * browser's own copy before anything is asked of the server, and a shortfall
   * that only lived in the last answer vanished on every reload and came back
   * a call later. The shop is still the one that decides it — this is the last
   * thing it said, replaced by the next pricing and never worked out here.
   *
   * Null for a cart written before this was recorded, and for a line nobody
   * has priced yet.
   */
  pairingShortPieces: number | null;
}

/** The whole cart as it is written down: the lines, and whose prices they were
 * last quoted at. Everything the summary states is derived from the lines. */
interface StoredCart {
  version: number;
  lines: CartStoredLine[];
  /**
   * Who the cart was last priced for, as the readable session hint says it —
   * `null` for a guest, absent for a cart written before this was recorded.
   *
   * A role rather than an account: what moves a customer's prices is signing
   * in or out (FR-CART-10), and the hint is the one identity available while
   * the cart is being priced — `/auth/me` answers a round trip later. Two
   * accounts in different price groups are indistinguishable here, but
   * reaching one from the other means signing out in between, and that
   * transition is caught.
   */
  pricedFor?: UserRole | null;
}

/** What happened to one line while the cart waited (FR-CART-10), most
 * consequential first — one per line, so a summary reads as a list of
 * products rather than a list of faults. */
export type CartChangeKind =
  | 'unavailable'
  | 'out-of-stock'
  | 'back-in-stock'
  | 'quantity'
  | 'unpriced'
  | 'price';

/**
 * A line the shop no longer describes the way the browser wrote it down.
 *
 * The figures are the line's **totals**, before and after: it is what the
 * customer is about to pay, and it is comparable even where the unit the line
 * is read in has moved underneath it.
 */
export interface CartChange {
  slug: string;
  name: string;
  kind: CartChangeKind;
  fromMinor: number | null;
  toMinor: number | null;
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
  /** What the view it was added from said about the stock — the first baseline
   * the line has. */
  availability: ProductAvailability | null;
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
  /** How many products the view it was added from said this one is sold with
   * (FR-SET-05) — the line wears the marker from the first frame. */
  pairedCount: number;
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
  private readonly document = inject(DOCUMENT);
  private readonly restored = this.read();
  private readonly stored = signal<CartStoredLine[]>(this.restored.lines);

  /** Who the written-down prices were quoted for; see `StoredCart.pricedFor`.
   * Undefined where the cart predates the field, which reads as "the visitor
   * it is being priced for now". */
  private pricedFor: UserRole | null | undefined = this.restored.pricedFor;

  /** Whether the cart has been priced once in this visit. The first answer is
   * the one that describes what changed while the cart waited; every one after
   * it answers an edit the customer just made. */
  private reported = false;

  private readonly changesState = signal<readonly CartChange[]>([]);

  /**
   * What changed while the cart waited (FR-CART-10) — empty until the first
   * pricing of a visit says otherwise, and empty again once it is dismissed.
   * Reported once and never rebuilt: an edit made afterwards is the customer's
   * own doing.
   */
  readonly changes = this.changesState.asReadonly();

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
      const restored = this.read();
      this.stored.set(restored.lines);
      this.pricedFor = restored.pricedFor;
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
          available: true,
          availability: addition.availability,
          notePrompt: addition.lineNotePrompt,
          pairedCount: addition.pairedCount,
          // Nobody has checked the cart against its pairings yet, and this
          // line is the reason the answer would change: the first preview
          // says it.
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
        available: true,
        availability: addition.availability,
        notePrompt: addition.lineNotePrompt,
        pairedCount: addition.pairedCount,
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
   * True where the prices written down were quoted to a *different* visitor
   * than the one here now — so the header is carrying somebody else's figures
   * until the cart is priced again (`CartRepricing`).
   *
   * A method rather than a signal: the session hint is a cookie, and nothing
   * reactive fires when one changes. The caller watches the session instead.
   */
  needsRepricing(): boolean {
    return this.stored().length > 0 && this.pricedFor !== this.currentRole();
  }

  /** Puts the change summary away; it does not come back this visit. */
  dismissChanges(): void {
    this.changesState.set([]);
  }

  /**
   * Folds a fresh preview back onto the stored cart: corrected quantities,
   * dropped notes, and the prices as they stand now.
   *
   * It never removes a line. The server flags a dead one; taking it out is the
   * customer's action, and a cart that quietly shortened itself between two
   * glances is worse than one that says what is wrong with it.
   *
   * The first answer of a visit is also what reports what changed while the
   * cart waited (FR-CART-10): it is the last moment the baseline the shop is
   * about to overwrite is still there to compare against.
   */
  applyPreview(preview: CartPreview): void {
    // By slug alone, which is what identifies a line. The answer may carry
    // another unit than the one that was sent — a product repacked out of it
    // falls back to the piece — and a key holding the unit would then match
    // nothing and drop the correction on the floor.
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
        pairedCount: fresh.pairedCount,
        // Taken as answered, not kept: an unavailable line is short of
        // nothing, and there is nothing in the last figure worth showing over
        // a newer one that says so.
        pairingShortPieces: fresh.pairingShortPieces,
        // The same reading the page makes of a fresh line: prices the shop
        // will not state are a product it no longer offers.
        available: fresh.prices !== null,
        availability: fresh.availability,
        unitPriceMinor:
          fresh.prices === null ? null : unitPriceOf(fresh.prices, fresh.unit),
        lineTotalMinor: fresh.lineTotalMinor,
      };
      // Hand back the same object where nothing moved, so an answer that only
      // confirms the cart does not count as a change to it.
      return sameLine(line, updated) ? line : updated;
    });
    this.report(changes);

    // An answer that only confirms what is written down is not a change to it,
    // so nothing here touches storage on every reply — unless the visitor it
    // was priced for has moved, which is itself worth writing down.
    const rebaselined = this.pricedFor !== this.currentRole();
    if (next.some((line, at) => line !== current[at])) this.write(next);
    else if (rebaselined) this.persist();
  }

  /**
   * Reports what the first pricing of a visit found — or says nothing at all,
   * where the cart was last priced for somebody else. Signing in or out moves
   * every tiered price at once, and FR-CART-10 is explicit that this is not
   * news: the re-pricing is silent, and the visit's one report is spent on it.
   */
  private report(changes: CartChange[]): void {
    const rebaselined =
      this.pricedFor !== undefined && this.pricedFor !== this.currentRole();
    if (!this.reported && !rebaselined) this.changesState.set(changes);
    this.reported = true;
  }

  /** The visitor the cart is being priced for, from the readable session hint
   * beside the httpOnly session cookie. */
  private currentRole(): UserRole | null {
    return this.isBrowser ? readSessionHint(this.document.cookie) : null;
  }

  private write(lines: CartStoredLine[]): void {
    this.stored.set(lines);
    this.persist();
  }

  /**
   * Writes the cart down, recording the visitor it was priced for as it goes:
   * every write states prices the shop quoted this visitor, whether it came
   * from a pricing call or from the buying controls on a product page.
   */
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

  /** Anything unreadable is discarded whole, and each surviving line is
   * shape-checked: the payload is editable by hand, and a string quantity
   * would otherwise reach the contract as one. */
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
          .filter(isStoredLine)
          .slice(0, CART_LINES_MAX),
        pricedFor: readPricedFor(parsed.pricedFor),
      };
    } catch {
      return { lines: [] };
    }
  }
}

/**
 * What one line's fresh price says happened to it while the cart waited, or
 * null where the shop still describes it exactly as it was written down.
 *
 * One answer per line, most consequential first: a withdrawn product is not
 * also a price change, and a corrected quantity explains the total that came
 * back with it. A line that could not be priced before and can be now is no
 * news — there is no earlier figure to name, and the row states the new one.
 */
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
  // Whether the shelf emptied or filled while the cart waited (FR-STOCK-04):
  // the first is what stops the order being placed, and the second is the news
  // that it no longer does. Ahead of the quantity and the price, because both
  // of those are questions of how much and this one is whether at all. "Few
  // left" is not reported — it restricts nothing, and the badge states it.
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

/** The stored visitor, or undefined where the cart carries none — the payload
 * is editable by hand, and a role that is not one reads as no answer. */
function readPricedFor(value: unknown): UserRole | null | undefined {
  if (value === null) return null;
  return (USER_ROLES as readonly unknown[]).includes(value)
    ? (value as UserRole)
    : undefined;
}

/**
 * Fills in a line stored before availability was written down, so a cart in a
 * browser today is read rather than discarded: what it holds was on offer when
 * it was put there, and the next pricing says whether it still is.
 */
function withAvailability(line: unknown): unknown {
  const candidate = line as { available?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return typeof candidate.available === 'boolean'
    ? candidate
    : { ...candidate, available: true };
}

/**
 * Fills in a line stored before the stock state was written down. Null is
 * "nobody said", which is also what an untracked product answers — so a cart
 * in a browser today reports nothing about stock until the first pricing of
 * the visit says otherwise.
 */
function withStockState(line: unknown): unknown {
  const candidate = line as { availability?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return 'availability' in candidate
    ? candidate
    : { ...candidate, availability: null };
}

/** Fills in a line stored before the pairings were written down. Zero is "no
 * marker", which is also what a product sold with nothing answers. */
function withPairedCount(line: unknown): unknown {
  const candidate = line as { pairedCount?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return line;
  return typeof candidate.pairedCount === 'number'
    ? candidate
    : { ...candidate, pairedCount: 0 };
}

/** Fills in a line stored before the shortfall was written down. Null is
 * "nobody has checked", which is also what a covered line answers — so a cart
 * in a browser today warns about nothing until the first pricing of the visit
 * says otherwise. */
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
    a.pairedCount === b.pairedCount &&
    a.pairingShortPieces === b.pairingShortPieces &&
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
    // Nothing reads this one yet — which is exactly why it is checked here: a
    // line stored without it would survive until whatever finally does.
    typeof candidate.addedAt === 'string' &&
    // Both are summed on every read — the header's total and the page's — and
    // a string among them turns the sum into concatenation rather than a
    // wrong number. They are also the baseline FR-CART-10 reports against.
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
    // Rendered as a figure in a sentence and counted into what the order card
    // says, so a hand-edited payload must not put a string in either.
    (candidate.pairingShortPieces === null ||
      Number.isInteger(candidate.pairingShortPieces)) &&
    isAvailability(candidate.availability)
  );
}

/** The stored stock state, which reaches a badge and a tone lookup — a payload
 * edited by hand must not put a fourth word in either. */
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
