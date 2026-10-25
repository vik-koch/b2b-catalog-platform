import { computed, linkedSignal, Signal } from '@angular/core';
import {
  correctPieces,
  pieceFloor,
  piecesFromUnitQuantity,
  ProductPackagingInfo,
  ProductUnit,
  stepFrom,
  unitQuantity,
  unitQuantityIsWhole,
} from '@b2b-catalog-platform/shared';
import { CurrencyConfig } from './price';
import { formatUnitQuantity, parseUnitQuantity } from './quantity';

/** As much of a cart line as choosing a quantity needs to read. */
export interface QuantityLine {
  unit: ProductUnit;
  pieces: number;
}

export interface BuyQuantityDeps {
  packaging: Signal<ProductPackagingInfo>;
  /** The product being bought. Every held choice resets when it changes: a
   * unit or a count chosen on one product means nothing on the next. */
  product: Signal<string>;
  /** The cart's line for this product, where it has one. While it is set the
   * choice is the line's, and changing it writes through `write`. */
  line: Signal<QuantityLine | undefined>;
  write: (unit: ProductUnit, pieces: number) => void;
  /** Decides the separator a reading is written with. */
  currency: CurrencyConfig;
}

/** Where a step landed. `at-floor` is the one the caller has to answer for:
 * there is nothing below the minimum except not buying the product. */
export type StepOutcome = 'moved' | 'at-floor';

/**
 * Choosing how much, in whichever unit it is being read through — the
 * arithmetic behind the stepper and the quantity field, apart from anything
 * that draws them.
 *
 * Two rules live here rather than in the component, because they are the whole
 * of what makes the field usable and neither is visible in a template:
 *
 * - **A quantity is stored in pieces; a unit only reads it.** Switching to
 *   boxes re-reads the same goods as 0.2 bx rather than rounding them up to a
 *   whole one, so changing unit is never a change of quantity.
 * - **The field is a draft, settled when it is left.** Everything else works in
 *   pieces, so a field bound to the piece count would round-trip text → pieces
 *   → text on every keystroke and land every rounding on the caret. Nothing
 *   reads the draft until `commit` finishes it.
 *
 * What a correction *says* is not decided here — `commit` and `step` report
 * what happened and the component words it.
 */
export function createBuyQuantity(deps: BuyQuantityDeps) {
  /** The piece is the default: the smallest commitment, and the one unit every
   * product is sold in. */
  const chosenUnit = linkedSignal<string, ProductUnit>({
    source: deps.product,
    computation: () => 'piece',
  });

  const chosenPieces = linkedSignal<string, number>({
    source: deps.product,
    computation: () => pieceFloor(deps.packaging()),
  });

  /** What is being typed, while it is being typed — and null the rest of the
   * time, which is when the field shows the quantity itself. */
  const typing = linkedSignal<string, string | null>({
    source: deps.product,
    computation: () => null,
  });

  const unit = computed(() => deps.line()?.unit ?? chosenUnit());
  /** The quantity, in pieces — what is stored, priced and shipped. */
  const pieces = computed(() => deps.line()?.pieces ?? chosenPieces());

  /** The smallest quantity worth keeping: below it the only sensible quantity
   * is none. One figure, whichever unit is reading it. */
  const floor = () => pieceFloor(deps.packaging());

  const setPieces = (next: number): void => {
    if (deps.line() !== undefined) deps.write(unit(), next);
    else chosenPieces.set(next);
  };

  /**
   * Turns whatever is in the field into a quantity the shop can supply, and
   * writes it down. Rounds **up** to the nearest orderable piece count,
   * whichever unit it was typed in: the lattice is the same one either way, so
   * 0.25 bx of a 24-piece box is six pieces, which a product packed in sixes
   * supplies exactly. A field left empty or unreadable asked for nothing, so
   * the quantity that stands is kept — the customer cleared a figure, they did
   * not order none.
   */
  const settle = (): boolean => {
    const raw = typing();
    typing.set(null);
    const typed = raw === null ? null : parseUnitQuantity(raw);
    const wanted =
      typed === null
        ? pieces()
        : (piecesFromUnitQuantity(deps.packaging(), unit(), typed) ?? floor());
    const corrected = correctPieces(deps.packaging(), wanted);
    if (corrected !== pieces()) setPieces(corrected);
    return corrected !== wanted;
  };

  /** The same quantity as the chosen unit reads it, which is the figure the
   * field shows. Never null: the selector only offers units the product has. */
  const quantity = computed(
    () => unitQuantity(deps.packaging(), unit(), pieces()) ?? pieces(),
  );
  const quantityText = computed(() =>
    formatUnitQuantity(quantity(), deps.currency),
  );

  return {
    unit,
    pieces,
    quantity,
    quantityText,
    /** Whether this unit reads as a whole number, which decides whether the
     * field takes decimals at all. */
    whole: computed(() => unitQuantityIsWhole(deps.packaging(), unit())),
    /** What the field holds: the draft while there is one, the quantity
     * otherwise. */
    fieldText: computed(() => typing() ?? quantityText()),

    /** Takes the keystroke and nothing else — nothing is parsed or written
     * down until the draft is settled. */
    type(value: string): void {
      typing.set(value);
    },

    /**
     * Settles the draft. True when the typed figure was corrected upwards to
     * one the shop can supply, which is the only thing there is to say about
     * it — the field beside the message already shows the figure that stands.
     */
    commit(): boolean {
      return settle();
    },

    /**
     * Changes the lens, and nothing else. The goods do not move: two packs read
     * through the box are 0.2 bx of the same twelve pieces, so there is nothing
     * to round, nothing to confirm and nothing to say. False when the unit
     * asked for is the one already chosen.
     */
    chooseUnit(next: ProductUnit): boolean {
      if (next === unit()) return false;
      settle();
      if (deps.line() !== undefined) deps.write(next, pieces());
      else chosenUnit.set(next);
      return true;
    },

    /**
     * One step is one of the chosen unit, except for pieces, which move by one
     * pack — so `+` on a product packed in sixes moves by six rather than into
     * a quantity the shop cannot break open. It **snaps** rather than adds: `+`
     * on a quarter of a box offers a box, not a box and a quarter.
     *
     * The floor it stops at is the *minimum*, which is a different figure: a
     * shop that will not ship fewer than 24 still sells them 6 at a time above
     * that. A whole box below the minimum is still a step down to the minimum;
     * only a quantity already sitting on it has nowhere left to go.
     */
    step(direction: 1 | -1): StepOutcome {
      // Whatever is in the field is the quantity being stepped from, so it is
      // settled first — a browser blurs the field on the press, but a keyboard
      // press on the key itself does not.
      settle();
      const wanted = stepFrom(deps.packaging(), unit(), pieces(), direction);
      if (wanted >= floor()) {
        setPieces(wanted);
        return 'moved';
      }
      if (pieces() > floor()) {
        setPieces(floor());
        return 'moved';
      }
      return 'at-floor';
    },
  };
}

/** What the controls hold, for a component that keeps one. */
export type BuyQuantity = ReturnType<typeof createBuyQuantity>;
