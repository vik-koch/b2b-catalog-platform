import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductDetail } from '@b2b-catalog-platform/shared';
import { CartService } from '../cart/cart.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { ProductBuyControls } from './product-buy-controls';
import { packagedPackaging, productDetail } from './product.fixture';

const text = defaultAppText.cart;
const unitText = defaultAppText.catalog.units;

/**
 * Ten to a pack, four packs to a box (so forty pieces), and a hundred-piece
 * minimum — ten whole packs, which is what the minimum now has to be.
 */
const packaged = productDetail({
  slug: 'filter-roast',
  name: 'Filter Roast',
  packaging: { ...packagedPackaging, piecesPerPack: 10, minPieceQty: 100 },
  prices: {
    pieceMilliMinor: 1250,
    // One step — one pack of ten — at 1.25 minor units a piece.
    pieceLotMinor: 12_500,
    pack: 7000,
    box: 27000,
  },
});

async function render(
  item: ProductDetail,
  canAdd = true,
  externalNote = false,
  /** The row lays the facts out beside the stepper; the stack leaves them to
   * its caller, which is why only the row states the minimum. */
  layout: 'stack' | 'row' = 'stack',
) {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductBuyControls],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });

  const fixture = TestBed.createComponent(ProductBuyControls);
  fixture.componentRef.setInput('item', item);
  fixture.componentRef.setInput('canAdd', canAdd);
  fixture.componentRef.setInput('externalNote', externalNote);
  fixture.componentRef.setInput('layout', layout);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;

  const rerender = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const quantity = () =>
    el.querySelector('input[type=text], input:not([type])');

  return {
    el,
    cart: TestBed.inject(CartService),
    rerender,
    text: () => el.textContent ?? '',
    /** Segments of both kinds: a unit on offer is a label round a radio, one
     * the product is not sold in is a button that answers for itself. */
    unitLabels: () =>
      [
        ...el.querySelectorAll(
          '[role=radiogroup] label, [role=radiogroup] button',
        ),
      ].map((segment) => (segment.textContent ?? '').trim()),
    quantityInput: () => quantity() as HTMLInputElement,
    async type(value: string) {
      const input = quantity() as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await rerender();
    },
    async blurQuantity() {
      const input = quantity() as HTMLInputElement;
      input.dispatchEvent(new Event('blur'));
      await rerender();
    },
    /** A press landing outside the bubble — what dismisses it. Pointerdown,
     * not click: that is the event the bubble listens for. */
    async pressOutside() {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
      await rerender();
    },
    async chooseUnit(label: string) {
      const option = [...el.querySelectorAll('[role=radiogroup] label')].find(
        (l) => (l.textContent ?? '').trim() === label,
      );
      option?.querySelector('input')?.dispatchEvent(new Event('change'));
      await rerender();
    },
    noteField: () => el.querySelector('textarea') as HTMLTextAreaElement | null,
    /** Types, then leaves the field — which is when a note is recorded. */
    async typeNote(value: string) {
      const field = el.querySelector('textarea') as HTMLTextAreaElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      await rerender();
      field.dispatchEvent(new Event('blur'));
      await rerender();
    },
    async click(label: string) {
      const button = [...el.querySelectorAll('button')].find(
        (b) =>
          (b.textContent ?? '').includes(label) ||
          b.getAttribute('aria-label') === label,
      );
      button?.click();
      await rerender();
    },
  };
}

describe('ProductBuyControls', () => {
  // The segments are one control and have to read as a scale, so each says
  // only its unit; what a pack holds is stated once, by the packaging line.
  it('names every unit the product is sold in, and nothing else', async () => {
    const view = await render(packaged);

    expect(view.unitLabels()).toEqual([
      unitText.select.piece,
      unitText.select.pack,
      unitText.select.box,
    ]);
  });

  // Three units in three fixed places on every card, whatever the product is
  // sold in — that is what lets a grid of these line up column by column.
  it('shows all three units for a product sold only by the piece', async () => {
    const view = await render(productDetail());

    expect(view.unitLabels()).toEqual([
      unitText.select.piece,
      unitText.select.pack,
      unitText.select.box,
    ]);
  });

  it('answers for a unit the product is not sold in rather than hiding it', async () => {
    const view = await render(productDetail());

    await view.click(unitText.select.pack);

    expect(view.text()).toContain(text.unitNotSold);
    // Pressing it changes nothing: the piece is still the chosen unit.
    expect(view.quantityInput().value).toBe('1');
  });

  // With a selector present, listing every unit's price beside it asks the
  // customer to match figures to segments.
  it('shows the price of the selected unit, and only that one', async () => {
    const view = await render(packaged);
    // Thousandths of a cent: €12.50 for a hundred-piece lot is €0.0125 each.
    expect(view.text()).toContain('0,013');
    expect(view.text()).not.toContain('70,00');

    await view.chooseUnit(unitText.select.pack);

    expect(view.text()).toContain('70,00');
    expect(view.text()).not.toContain('270,00');
  });

  it('starts at the piece, in the smallest quantity that may be ordered', async () => {
    const view = await render(packaged);

    expect(view.quantityInput().value).toBe('100');
  });

  // The quantity is the same goods expressed another way, so it converts
  // rather than restarting.
  it('converts the quantity when the unit changes', async () => {
    const view = await render(packaged);

    // A hundred pieces is exactly ten packs of ten.
    await view.chooseUnit(unitText.select.pack);
    expect(view.quantityInput().value).toBe('10');

    // Ten packs is two and a half boxes of forty, and half a box is not
    // something the shop packs — so three.
    await view.chooseUnit(unitText.select.box);
    expect(view.quantityInput().value).toBe('3');

    await view.chooseUnit(unitText.select.piece);
    expect(view.quantityInput().value).toBe('120');
  });

  it('rounds a typed quantity up to the nearest orderable one, and says so', async () => {
    const view = await render(packaged);

    await view.type('141');
    // Nothing is rewritten while the number is still being typed.
    expect(view.quantityInput().value).toBe('141');

    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('150');
    expect(view.text()).toContain(`141 adjusted to 150 ${unitText.piece}`);
  });

  // The rule this replaced: the minimum used to be the increment too, so 140
  // against a minimum of 100 was pushed all the way to 200. The pack is what
  // cannot be broken open, and fourteen whole packs is a quantity the shop can
  // pick — so it is left alone.
  it('leaves a quantity that is whole packs above the minimum alone', async () => {
    const view = await render(packaged);

    await view.type('140');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('140');
    expect(view.text()).not.toContain('adjusted to');
  });

  // The hole the piece-only minimum left: one pack of ten is ten pieces, which
  // is nowhere near a hundred, so switching unit walked straight under the
  // rule. The minimum is a statement about the goods and holds in every unit.
  it('holds a pack order to the same minimum, in packs', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.pack);

    await view.type('1');
    await view.blurQuantity();

    // A hundred pieces is ten packs of ten.
    expect(view.quantityInput().value).toBe('10');
    expect(view.text()).toContain(`1 adjusted to 10 ${unitText.pack}`);
  });

  it('states the minimum in the unit the stepper is counting in', async () => {
    const view = await render(packaged, true, false, 'row');

    expect(view.text()).toContain(
      `${unitText.minQuantity}: 100 ${unitText.piece}`,
    );

    await view.chooseUnit(unitText.select.pack);

    // The same minimum, in the words the stepper stops in.
    expect(view.text()).toContain(
      `${unitText.minQuantity}: 10 ${unitText.pack}`,
    );
  });

  // A unit change is the other way a quantity gets rounded, and it rounds up
  // just as a typed one does — so it says so, in the words of the unit being
  // switched to rather than in pieces.
  it('says when a unit change had to round the quantity up', async () => {
    const view = await render(packaged);

    // 100 pieces is two and a half boxes of forty.
    await view.chooseUnit(unitText.select.box);

    expect(view.text()).toContain(`2.5 adjusted to 3 ${unitText.box}`);
    // Not "3 pcs", which is what a hardcoded piece word used to say.
    expect(view.text()).not.toContain(`adjusted to 3 ${unitText.piece}`);
  });

  it('says nothing when the unit change divides exactly', async () => {
    const view = await render(packaged);

    // A hundred pieces is exactly ten packs.
    await view.chooseUnit(unitText.select.pack);

    expect(view.text()).not.toContain('adjusted to');
  });

  // The notice is feedback on something already done, so it clears itself —
  // and any further edit drops it, since it no longer describes the selection.
  it('drops the correction notice as soon as the selection changes again', async () => {
    const view = await render(packaged);
    await view.type('141');
    await view.blurQuantity();
    expect(view.text()).toContain('adjusted to');

    await view.click(text.increase);

    expect(view.text()).not.toContain('adjusted to');
  });

  // Two different figures: the pack is what it moves by, the minimum is where
  // it stops. A shop that will not ship fewer than a hundred still sells them
  // ten at a time above that.
  it('steps pieces by the pack, and stops at the minimum', async () => {
    const view = await render(packaged);

    await view.click(text.increase);
    expect(view.quantityInput().value).toBe('110');

    await view.click(text.decrease);
    await view.click(text.decrease);

    expect(view.quantityInput().value).toBe('100');
  });

  // ADR 0035: a line that cannot be priced exactly shows words, never a zero.
  it('says a line has no price rather than showing a made-up one', async () => {
    const view = await render(
      productDetail({
        prices: {
          pieceMilliMinor: 1250,
          pieceLotMinor: null,
          pack: null,
          box: null,
        },
      }),
    );

    await view.click(text.add);

    // The per-piece figure is a display price; the line total it cannot be
    // derived from is words.
    expect(view.text()).toContain(text.noPrice);
    expect(view.text()).not.toContain('0,00');
  });

  it('adds the chosen unit and quantity to the cart', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.box);
    await view.click(text.add);

    expect(view.cart.lines()).toEqual([
      expect.objectContaining({
        slug: 'filter-roast',
        name: 'Filter Roast',
        unit: 'box',
        // 100 pieces rounds up to three boxes of forty, at 270.00 the box.
        quantity: 3,
        note: null,
        lineTotalMinor: 81_000,
      }),
    ]);
  });

  it('corrects the quantity on the way into the cart, not only on blur', async () => {
    const view = await render(packaged);
    await view.type('141');
    await view.click(text.add);

    expect(view.cart.lines()[0].quantity).toBe(150);
  });

  // The change the customer made is the feedback: there is nothing to confirm
  // and nowhere to send them.
  it('replaces the button with what the line costs once it is in the cart', async () => {
    const view = await render(packaged);
    await view.click(text.add);

    expect(view.text()).not.toContain(text.add);
    expect(view.text()).toContain('Added for');
    // 100 pieces is ten packs of ten, at 12.50 the pack.
    expect(view.text()).toContain('1.250,00');

    // 100 pieces is three boxes of forty once rounded up, and one more makes
    // four at 270.00.
    await view.chooseUnit(unitText.select.box);
    await view.click(text.increase);

    expect(view.text()).toContain('1.080,00');
  });

  it('edits the line in the cart rather than offering to add it twice', async () => {
    const view = await render(packaged);
    await view.click(text.add);

    await view.click(text.increase);

    expect(view.cart.lines()).toHaveLength(1);
    expect(view.cart.lines()[0].quantity).toBe(110);
    expect(view.text()).toContain('1.375,00');
  });

  it('moves the line to another unit, carrying the quantity across', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.pack);
    await view.click(text.add);

    await view.chooseUnit(unitText.select.box);

    expect(view.cart.lines()).toHaveLength(1);
    // Ten packs is 100 pieces, which fills two boxes of forty with room to
    // spare, so three.
    expect(view.cart.lines()[0]).toMatchObject({ unit: 'box', quantity: 3 });
  });

  // There is nothing below the minimum except not buying the product, and that
  // is worth asking about rather than doing.
  it('asks before taking the line out when the stepper goes below the minimum', async () => {
    const view = await render(packaged);
    await view.click(text.add);

    await view.click(text.decrease);

    expect(view.text()).toContain(text.removeQuestion);
    expect(view.cart.lines()).toHaveLength(1);

    await view.click(text.removeYes);

    expect(view.cart.lines()).toHaveLength(0);
    expect(view.text()).not.toContain(text.removeQuestion);
  });

  it('keeps the line where the question is answered by clicking elsewhere', async () => {
    const view = await render(packaged);
    await view.click(text.add);
    await view.click(text.decrease);

    await view.pressOutside();

    expect(view.text()).not.toContain(text.removeQuestion);
    expect(view.cart.lines()).toHaveLength(1);
  });

  // Nothing to take out yet: the stepper simply stops at the minimum.
  it('does not offer to remove a product that is not in the cart', async () => {
    const view = await render(packaged);

    await view.click(text.decrease);

    expect(view.text()).not.toContain(text.removeQuestion);
    expect(view.quantityInput().value).toBe('100');
  });

  it('dismisses the correction bubble on a click anywhere', async () => {
    const view = await render(packaged);
    await view.type('141');
    await view.blurQuantity();
    expect(view.text()).toContain('adjusted to');

    await view.pressOutside();

    expect(view.text()).not.toContain('adjusted to');
  });

  // The signal clamped it long ago; what was missing was the field agreeing.
  // Back to the smallest quantity the shop will sell in that unit — which for
  // packs of ten against a hundred-piece minimum is ten packs, not one.
  it('writes an emptied or nought quantity back as the minimum on the way out', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.pack);

    await view.type('0');
    await view.blurQuantity();
    expect(view.quantityInput().value).toBe('10');

    await view.type('');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('10');
  });

  it('offers no way to add from the editor preview', async () => {
    const view = await render(packaged, false);

    expect(view.text()).not.toContain(text.add);
    // The units, the prices and the quantity are still shown: that is what a
    // manager opened the preview to check.
    expect(view.unitLabels()).toHaveLength(3);
  });
});

/**
 * FR-CART-08 on a card or a row, where there is no room for a field: the note
 * lives behind a button beside the price, and the first add opens it.
 */
describe('ProductBuyControls, a product that takes a note', () => {
  const noted = productDetail({
    slug: 'cup-set',
    name: 'Cup Set',
    lineNoteEnabled: true,
    lineNotePrompt: 'Which glaze colours?',
  });

  it('offers no note button for a product that does not take one', async () => {
    const view = await render(packaged);

    expect(view.el.querySelector('[aria-label="' + text.noteAdd + '"]')).toBe(
      null,
    );
  });

  // Asked once, not imposed: the bubble is the add button's first press, and
  // its own button adds — with a note or straight past it.
  // The button adds; the note is a control of its own beside the price.
  it('adds without interrupting, and records a note written first', async () => {
    const view = await render(noted);

    await view.click(text.noteAdd);
    // The product's question is the field's placeholder, not a line under it.
    expect(view.el.querySelector('textarea')?.placeholder).toBe(
      'Which glaze colours?',
    );
    await view.typeNote('Three sand, three slate');
    await view.click(text.add);

    expect(view.cart.lines()[0].note).toBe('Three sand, three slate');
  });

  it('adds straight away for a customer who writes nothing', async () => {
    const view = await render(noted);

    await view.click(text.add);

    expect(view.cart.count()).toBe(1);
    expect(view.cart.lines()[0].note).toBeNull();
  });

  // Once the line is in the cart these controls edit it, the note included —
  // written when the field is left, not letter by letter.
  it('writes the note straight onto a line already in the cart', async () => {
    const view = await render(noted);
    await view.click(text.add);

    await view.click(text.noteAdd);
    await view.typeNote('Sand only');

    expect(view.cart.lines()[0].note).toBe('Sand only');
  });

  it('leaves the note to the caller where one is offered a field', async () => {
    const view = await render(noted, true, true);

    expect(view.el.querySelector('[aria-label="' + text.noteAdd + '"]')).toBe(
      null,
    );
    // And adding is not interrupted by a bubble that is not there.
    await view.click(text.add);
    expect(view.cart.count()).toBe(1);
  });
});
