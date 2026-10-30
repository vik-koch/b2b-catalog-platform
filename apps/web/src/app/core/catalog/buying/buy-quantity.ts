import { MoneyFormat } from '@b2b-catalog-platform/shared';
import { computed, linkedSignal, Signal } from '@angular/core';
import {
  correctPieces,
  pieceFloor,
  piecesFromUnitQuantity,
  ProductPackaging,
  ProductUnit,
  stepFrom,
  unitQuantity,
  unitQuantityIsWhole,
} from '@b2b-catalog-platform/shared/core/catalog';
import { formatUnitQuantity, parseUnitQuantity } from './quantity';

/** As much of a cart line as choosing a quantity needs to read. */
export interface QuantityLine {
  unit: ProductUnit;
  pieces: number;
}

export interface BuyQuantityDeps {
  packaging: Signal<ProductPackaging>;
  /** The product being bought. Every held choice resets when it changes: a
   * unit or a count chosen on one product means nothing on the next. */
  product: Signal<string>;
  /** The cart's line for this product, where it has one. While it is set the
   * choice is the line's, and changing it writes through `write`. */
  line: Signal<QuantityLine | undefined>;
  write: (unit: ProductUnit, pieces: number) => void;
  /** Decides the separator a reading is written with. */
  currency: MoneyFormat;
}

/** Where a step landed. `at-floor` is the one the caller has to answer for:
 * there is nothing below the minimum except not buying the product. */
export type StepOutcome = 'moved' | 'at-floor';

/**
 * The arithmetic behind the stepper and the quantity field, apart from what
 * draws them, on two rules:
 *
 * - A quantity is stored in pieces; a unit only reads it, so changing unit is
 *   never a change of quantity.
 * - The field is a draft, settled when it is left: bound to the piece count it
 *   would round-trip on every keystroke and land each rounding on the caret.
 *
 * `commit` and `step` report what happened; the component words it.
 */
export function createBuyQuantity(deps: BuyQuantityDeps) {
  /** The piece: the smallest commitment, and sold for every product. */
  const chosenUnit = linkedSignal<string, ProductUnit>({
    source: deps.product,
    computation: () => 'piece',
  });

  const chosenPieces = linkedSignal<string, number>({
    source: deps.product,
    computation: () => pieceFloor(deps.packaging()),
  });

  /** Null when not typing, and the field shows the quantity. */
  const typing = linkedSignal<string, string | null>({
    source: deps.product,
    computation: () => null,
  });

  const unit = computed(() => deps.line()?.unit ?? chosenUnit());
  /** The quantity, in pieces — what is stored, priced and shipped. */
  const pieces = computed(() => deps.line()?.pieces ?? chosenPieces());

  /** Below it the only sensible quantity is none, in any unit. */
  const floor = () => pieceFloor(deps.packaging());

  const setPieces = (next: number): void => {
    if (deps.line() !== undefined) deps.write(unit(), next);
    else chosenPieces.set(next);
  };

  /**
   * Rounds up to the nearest orderable piece count in any unit (0.25 bx of a
   * 24-piece box is six pieces). An empty or unreadable field asked for
   * nothing, so the quantity stands.
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

  /** As the chosen unit reads it; the selector offers only units it has. */
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
    /** Whether the field takes decimals at all. */
    whole: computed(() => unitQuantityIsWhole(deps.packaging(), unit())),
    fieldText: computed(() => typing() ?? quantityText()),

    /** Nothing is parsed until the draft is settled. */
    type(value: string): void {
      typing.set(value);
    },

    /** True where the typed figure was corrected upwards. */
    commit(): boolean {
      return settle();
    },

    /** Changes the lens, not the goods. False for the unit already chosen. */
    chooseUnit(next: ProductUnit): boolean {
      if (next === unit()) return false;
      settle();
      if (deps.line() !== undefined) deps.write(next, pieces());
      else chosenUnit.set(next);
      return true;
    },

    /**
     * One of the chosen unit, but pieces move by a pack. It snaps rather than
     * adds: `+` on a quarter box offers a box. It stops at the minimum, a
     * different figure from the step (24 minimum, sold in sixes).
     */
    step(direction: 1 | -1): StepOutcome {
      // Settled first: a key pressed by keyboard does not blur the field.
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

export type BuyQuantity = ReturnType<typeof createBuyQuantity>;
