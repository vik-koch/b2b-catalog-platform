import { signal } from '@angular/core';
import {
  ProductPackagingInfo,
  ProductUnit,
} from '@b2b-catalog-platform/shared';
import { createBuyQuantity, QuantityLine } from './buy-quantity';
import { packagedPackaging, plainPackaging } from './product.fixture';

/** Six to a pack, four packs to a box, no fewer than six. */
const packaged: ProductPackagingInfo = { ...packagedPackaging };

function chooseFor(
  packaging: ProductPackagingInfo = packaged,
  startingLine: QuantityLine | undefined = undefined,
) {
  const product = signal('espresso-roast');
  const line = signal<QuantityLine | undefined>(startingLine);
  const written: QuantityLine[] = [];
  const quantity = createBuyQuantity({
    packaging: signal(packaging),
    product,
    line,
    write: (unit, pieces) => {
      written.push({ unit, pieces });
      line.set({ unit, pieces });
    },
    currency: { code: 'EUR', locale: 'de-DE' },
  });
  return { quantity, product, line, written };
}

describe('createBuyQuantity', () => {
  it('starts at the smallest quantity that may be ordered, by the piece', () => {
    const { quantity } = chooseFor();

    expect(quantity.unit()).toBe('piece');
    expect(quantity.pieces()).toBe(6);
  });

  it('re-reads the same pieces through whichever unit is chosen', () => {
    const { quantity } = chooseFor();

    quantity.chooseUnit('box');

    // Six of a 24-piece box, unmoved: a quarter of one.
    expect(quantity.pieces()).toBe(6);
    expect(quantity.quantity()).toBe(0.25);
  });

  it('reports nothing to say when the unit asked for is already chosen', () => {
    const { quantity } = chooseFor();

    expect(quantity.chooseUnit('piece')).toBe(false);
  });

  it('holds the draft until it is committed', () => {
    const { quantity } = chooseFor();

    quantity.type('18');

    expect(quantity.fieldText()).toBe('18');
    expect(quantity.pieces()).toBe(6);
  });

  it('rounds a typed quantity up to one the shop can supply, and says so', () => {
    const { quantity } = chooseFor();

    quantity.type('7');

    expect(quantity.commit()).toBe(true);
    expect(quantity.pieces()).toBe(12);
  });

  it('says nothing when the typed quantity already fits the lattice', () => {
    const { quantity } = chooseFor();

    quantity.type('12');

    expect(quantity.commit()).toBe(false);
    expect(quantity.pieces()).toBe(12);
  });

  it('keeps the standing quantity when the field is cleared', () => {
    const { quantity } = chooseFor();
    quantity.type('12');
    quantity.commit();

    quantity.type('');

    expect(quantity.commit()).toBe(false);
    expect(quantity.pieces()).toBe(12);
  });

  it('takes a fraction of a box and snaps it up to a quantity that exists', () => {
    const { quantity } = chooseFor();
    quantity.chooseUnit('box');

    quantity.type('0,3');
    quantity.commit();

    // 0.3 bx is 7.2 pieces; the next the shop can break out is two packs.
    expect(quantity.pieces()).toBe(12);
  });

  it('steps pieces by the pack rather than one at a time', () => {
    const { quantity } = chooseFor();

    expect(quantity.step(1)).toBe('moved');
    expect(quantity.pieces()).toBe(12);
  });

  it('snaps a part box up to the whole box rather than past it', () => {
    const { quantity } = chooseFor();
    quantity.chooseUnit('box');
    quantity.type('0,25');
    quantity.commit();

    quantity.step(1);

    expect(quantity.pieces()).toBe(24);
  });

  it('steps down to the minimum from above it', () => {
    const { quantity } = chooseFor();
    quantity.type('18');
    quantity.commit();

    expect(quantity.step(-1)).toBe('moved');
    expect(quantity.pieces()).toBe(12);
  });

  it('reports the floor rather than going below the minimum', () => {
    const { quantity } = chooseFor();

    expect(quantity.step(-1)).toBe('at-floor');
    expect(quantity.pieces()).toBe(6);
  });

  it('settles whatever is in the field before stepping from it', () => {
    const { quantity } = chooseFor();

    quantity.type('7');
    quantity.step(1);

    // 7 settles to 12, and the step goes on from there.
    expect(quantity.pieces()).toBe(18);
  });

  it('writes through to the cart line rather than holding its own count', () => {
    const { quantity, written } = chooseFor(packaged, {
      unit: 'piece',
      pieces: 12,
    });

    quantity.step(1);

    expect(written).toEqual([{ unit: 'piece', pieces: 18 }]);
    expect(quantity.pieces()).toBe(18);
  });

  it('writes the unit change through to the line, keeping the pieces', () => {
    const { quantity, written } = chooseFor(packaged, {
      unit: 'piece',
      pieces: 24,
    });

    quantity.chooseUnit('box');

    expect(written).toEqual([{ unit: 'box', pieces: 24 }]);
  });

  it('resets every held choice when the product changes', () => {
    const { quantity, product } = chooseFor();
    quantity.chooseUnit('box');
    quantity.type('2');
    quantity.commit();

    product.set('another-roast');

    expect(quantity.unit()).toBe<ProductUnit>('piece');
    expect(quantity.pieces()).toBe(6);
    expect(quantity.fieldText()).toBe('6');
  });

  it('reads a piece-only product as whole numbers', () => {
    const { quantity } = chooseFor({ ...plainPackaging });

    expect(quantity.whole()).toBe(true);
    expect(quantity.pieces()).toBe(1);
  });

  it('reads a box as a figure that can have decimals', () => {
    const { quantity } = chooseFor();

    quantity.chooseUnit('box');

    expect(quantity.whole()).toBe(false);
  });

  it("writes the reading with the deployment's decimal separator", () => {
    const { quantity } = chooseFor();
    quantity.chooseUnit('box');

    expect(quantity.quantityText()).toBe('0,25');
  });
});
