import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ProductDetail } from '@b2b-catalog-platform/shared/core/catalog';
import { NARROW_SCREEN_QUERIES } from '@b2b-catalog-platform/ui/core/narrow-screen';

import { ProductBuyControls } from './core/catalog/buying/product-buy-controls';
import { ProductCart } from './core/catalog/buying/product-cart';
import { defaultSharedCatalogText } from './core/catalog/catalog-text.fixture';
import {
  packagedPackaging,
  productDetail,
} from './core/catalog/product.fixture';
import { DEPLOYMENT_CONFIG } from './platform/config/deployment-config';
import { defaultDeploymentConfig } from './platform/config/deployment-config.fixture';
import { SHARED_TEXT } from './platform/config/shared-text';
import { defaultSharedText } from './platform/config/shared-text.fixture';
import { STOREFRONT_TEXT } from './platform/config/storefront-text';
import { defaultStorefrontText } from './platform/config/storefront-text.fixture';
import { CartService } from './storefront/ordering/cart/cart.service';

/** jsdom's <dialog> has no showModal/close; the note opens itself on render. */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

/** The real one, captured at load and restored after each test, or a leftover
 * stub answers the next spec file's breakpoint questions. */
const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

/** A phone. Only the breakpoint queries are answered; anything else is left to
 * the real implementation. */
function onNarrowScreen(): void {
  const queries: readonly string[] = Object.values(NARROW_SCREEN_QUERIES);
  window.matchMedia = ((query: string) =>
    queries.includes(query)
      ? ({
          matches: true,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as unknown as MediaQueryList)
      : realMatchMedia.call(window, query)) as typeof window.matchMedia;
}

const text = defaultSharedCatalogText.buying;
const unitText = defaultSharedCatalogText.unitFacts;
/** One sentence, whatever was corrected and whichever unit it was typed in. */
const corrected = text.quantityCorrected;

/** Ten to a pack, four packs to a box (forty pieces), and a hundred-piece
 * minimum: ten whole packs. */
const packaged = productDetail({
  slug: 'filter-roast',
  name: 'Filter Roast',
  packaging: { ...packagedPackaging, piecesPerPack: 10, minPieceQty: 100 },
  // €0.70 a piece, and every other figure is that multiplied out: a step is a
  // pack of ten, a box is four of those. The arithmetic guarantees they agree,
  // so a fixture that disagreed would be testing a shop that cannot exist.
  prices: {
    piece: 70,
    pack: 700,
    box: 2800,
  },
});

/**
 * The same packaging in a shop that sells a single bag: the minimum is under a
 * pack, so packs are opened and a piece quantity moves by one. The lot is a
 * piece, and every other figure is that multiplied out.
 */
const loose = productDetail({
  slug: 'single-bag',
  name: 'Single Bag',
  packaging: { ...packagedPackaging, piecesPerPack: 10, minPieceQty: 1 },
  prices: {
    piece: 70,
    pack: 700,
    box: 2800,
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
      // At the root because it is the real cart the controls write to, and
      // catalog may not import ordering.
      { provide: ProductCart, useExisting: CartService },
      provideRouter([]),
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
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
    /** A press outside the bubble, which dismisses it. Pointerdown, not
     * click: what the bubble listens for. */
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
    /** Types, then leaves the field, which records a note. */
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

  // Three units in three fixed places on every card, so a grid lines up by
  // column whatever the product is sold in.
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
    expect(view.text()).toContain('0,70');
    expect(view.text()).not.toContain('7,00');

    await view.chooseUnit(unitText.select.pack);

    expect(view.text()).toContain('7,00');
    expect(view.text()).not.toContain('28,00');
  });

  it('starts at the piece, in the smallest quantity that may be ordered', async () => {
    const view = await render(packaged);

    expect(view.quantityInput().value).toBe('100');
  });

  // The change the lens model is: a unit says how the same hundred pieces are
  // read, so nothing is converted, nothing is rounded, and going back reads
  // the figure it started from.
  it('re-reads the same quantity through whichever unit is chosen', async () => {
    const view = await render(packaged);

    // A hundred pieces is exactly ten packs of ten...
    await view.chooseUnit(unitText.select.pack);
    expect(view.quantityInput().value).toBe('10');

    // ...and two and a half boxes of forty, which is simply what it says.
    await view.chooseUnit(unitText.select.box);
    expect(view.quantityInput().value).toBe('2,5');

    await view.chooseUnit(unitText.select.piece);
    expect(view.quantityInput().value).toBe('100');
  });

  // The whole point of the fraction: a quantity the shop can pick is reachable
  // through the box as readily as through the pack.
  it('takes a fraction of a box and snaps it to a quantity that exists', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.box);

    // 2.6 boxes of forty is 104 pieces, which is not whole packs of ten.
    await view.type('2,6');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('2,75');
    expect(view.cart.lines()).toHaveLength(0);
  });

  it('rounds a typed quantity up to the nearest orderable one, and says so', async () => {
    const view = await render(packaged);

    await view.type('141');
    // Nothing is rewritten while the number is still being typed.
    expect(view.quantityInput().value).toBe('141');

    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('150');
    expect(view.text()).toContain(corrected);
  });

  // The minimum is no increment: 140 against a minimum of 100 is fourteen
  // whole packs, which the shop can pick, so it stays.
  it('leaves a quantity that is whole packs above the minimum alone', async () => {
    const view = await render(packaged);

    await view.type('140');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('140');
    expect(view.text()).not.toContain(corrected);
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
    expect(view.text()).toContain(corrected);
  });

  it('states the minimum in the unit the stepper is counting in', async () => {
    const view = await render(packaged, true, false, 'row');

    expect(view.text()).toContain(
      `${unitText.minQuantity}: 100 ${defaultSharedCatalogText.units.piece}`,
    );

    await view.chooseUnit(unitText.select.pack);

    // The same minimum, in the words the stepper stops in.
    expect(view.text()).toContain(
      `${unitText.minQuantity}: 10 ${defaultSharedCatalogText.units.pack}`,
    );
  });

  // Changing unit used to round the quantity up to a whole one and announce
  // it. There is nothing left to announce: the goods do not move.
  it('says nothing when the unit changes, whether it divides or not', async () => {
    const view = await render(packaged);

    await view.chooseUnit(unitText.select.pack);
    expect(view.text()).not.toContain(corrected);

    await view.chooseUnit(unitText.select.box);
    expect(view.text()).not.toContain(corrected);
  });

  // The notice is feedback on something done, so it clears itself, and any
  // edit drops it.
  it('drops the correction notice as soon as the selection changes again', async () => {
    const view = await render(packaged);
    await view.type('141');
    await view.blurQuantity();
    expect(view.text()).toContain(corrected);

    await view.click(text.increaseAria);

    expect(view.text()).not.toContain(corrected);
  });

  // Two different figures: the pack is what it moves by, the minimum is where
  // it stops. A shop that will not ship fewer than a hundred still sells them
  // ten at a time above that.
  it('steps pieces by the pack, and stops at the minimum', async () => {
    const view = await render(packaged);

    await view.click(text.increaseAria);
    expect(view.quantityInput().value).toBe('110');

    await view.click(text.decreaseAria);
    await view.click(text.decreaseAria);

    expect(view.quantityInput().value).toBe('100');
  });

  // A stepper is pressed to reach a figure the unit can say plainly, so it
  // snaps to whole ones rather than adding a step to a fraction.
  it('steps a part box up to the whole box, not past it', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.box);
    expect(view.quantityInput().value).toBe('2,5');

    await view.click(text.increaseAria);
    expect(view.quantityInput().value).toBe('3');

    await view.click(text.decreaseAria);
    expect(view.quantityInput().value).toBe('2,5');
  });

  // The field used to be rewritten from the piece count on every keystroke,
  // which put a rounding on the caret between two of them.
  it('leaves the field alone until it is left', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.box);

    // 2,41 of a forty-piece box is 97 pieces, which reads back as 2,425; the
    // field must not rewrite it between keystrokes.
    await view.type('2,41');
    expect(view.quantityInput().value).toBe('2,41');

    // A separator on its way to a fraction survives being pressed.
    await view.type('2,');
    expect(view.quantityInput().value).toBe('2,');

    await view.blurQuantity();
    expect(view.quantityInput().value).toBe('2,5');
  });

  // The field is a draft: nothing reads it until it is left. Pricing a
  // half-typed figure moved the line's total, the cart and the header behind
  // the caret while the customer was still typing it.
  it('moves nothing until the field is left', async () => {
    const view = await render(packaged);
    await view.click(text.add);
    expect(view.text()).toContain('70,00');

    await view.chooseUnit(unitText.select.box);
    await view.type('2,51');

    // 2,51 of a forty-piece box is 101 pieces, corrected to 110, but not on
    // the keystroke.
    expect(view.text()).toContain('70,00');
    expect(view.cart.lines()[0].pieces).toBe(100);

    await view.blurQuantity();

    expect(view.text()).toContain('77,00');
    expect(view.cart.lines()[0].pieces).toBe(110);
  });

  it('takes either separator for the fraction', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.box);

    await view.type('3.25');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('3,25');
  });

  // A piece count is whole packs, so a pack reading is never a fraction, and
  // the field offers no decimals.
  it('takes no decimals in a unit that cannot read as one', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.pack);

    expect(view.quantityInput().getAttribute('inputmode')).toBe('numeric');

    await view.chooseUnit(unitText.select.box);
    expect(view.quantityInput().getAttribute('inputmode')).toBe('decimal');
  });

  // The bug this case was added for: a minimum of one against a pack of ten was
  // pushed up to a whole pack, so a shop selling single bags sold ten.
  it('takes single pieces where the minimum is under a pack', async () => {
    const view = await render(loose);

    await view.type('3');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('3');
    expect(view.text()).not.toContain(corrected);
  });

  it('reads an opened pack as the fraction it is', async () => {
    const view = await render(loose);
    await view.chooseUnit(unitText.select.pack);

    expect(view.quantityInput().getAttribute('inputmode')).toBe('decimal');
  });

  // The correction is said every time: a bubble shown only on the first of
  // three reads as broken.
  it('says so every time a quantity is corrected', async () => {
    const view = await render(packaged);

    await view.type('141');
    await view.blurQuantity();
    expect(view.text()).toContain(corrected);

    await view.pressOutside();
    expect(view.text()).not.toContain(corrected);

    await view.type('141');
    await view.blurQuantity();
    expect(view.text()).toContain(corrected);
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
        // Two and a half boxes of forty: the quantity is pieces, the box only
        // how they are counted.
        pieces: 100,
        note: null,
        lineTotalMinor: 7000,
      }),
    ]);
  });

  it('corrects the quantity on the way into the cart, not only on blur', async () => {
    const view = await render(packaged);
    await view.type('141');
    await view.click(text.add);

    expect(view.cart.lines()[0].pieces).toBe(150);
  });

  // The change the customer made is the feedback: there is nothing to confirm
  // and nowhere to send them.
  it('replaces the button with what the line costs once it is in the cart', async () => {
    const view = await render(packaged);
    await view.click(text.add);

    expect(view.text()).not.toContain(text.add);
    expect(view.text()).toContain('Added for');
    // 100 pieces is ten packs of ten, at 7.00 the pack.
    expect(view.text()).toContain('70,00');

    // In boxes, 100 pieces is two and a half, so one press offers three, not
    // three and a half.
    await view.chooseUnit(unitText.select.box);
    await view.click(text.increaseAria);

    expect(view.quantityInput().value).toBe('3');
    expect(view.text()).toContain('84,00');
  });

  it('edits the line in the cart rather than offering to add it twice', async () => {
    const view = await render(packaged);
    await view.click(text.add);

    await view.click(text.increaseAria);

    expect(view.cart.lines()).toHaveLength(1);
    expect(view.cart.lines()[0].pieces).toBe(110);
    expect(view.text()).toContain('77,00');
  });

  it('re-reads the line in another unit without touching what it holds', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.pack);
    await view.click(text.add);

    await view.chooseUnit(unitText.select.box);

    expect(view.cart.lines()).toHaveLength(1);
    // The same hundred pieces, now counted in boxes of forty.
    expect(view.cart.lines()[0]).toMatchObject({ unit: 'box', pieces: 100 });
    expect(view.quantityInput().value).toBe('2,5');
  });

  // There is nothing below the minimum except not buying the product, and that
  // is worth asking about rather than doing.
  it('asks before taking the line out when the stepper goes below the minimum', async () => {
    const view = await render(packaged);
    await view.click(text.add);

    await view.click(text.decreaseAria);

    expect(view.text()).toContain(text.removeQuestion);
    expect(view.cart.lines()).toHaveLength(1);

    await view.click(text.removeYes);

    expect(view.cart.lines()).toHaveLength(0);
    expect(view.text()).not.toContain(text.removeQuestion);
  });

  it('keeps the line where the question is answered by clicking elsewhere', async () => {
    const view = await render(packaged);
    await view.click(text.add);
    await view.click(text.decreaseAria);

    await view.pressOutside();

    expect(view.text()).not.toContain(text.removeQuestion);
    expect(view.cart.lines()).toHaveLength(1);
  });

  // Nothing to take out yet: the stepper simply stops at the minimum.
  it('does not offer to remove a product that is not in the cart', async () => {
    const view = await render(packaged);

    await view.click(text.decreaseAria);

    expect(view.text()).not.toContain(text.removeQuestion);
    expect(view.quantityInput().value).toBe('100');
  });

  it('dismisses the correction bubble on a click anywhere', async () => {
    const view = await render(packaged);
    await view.type('141');
    await view.blurQuantity();
    expect(view.text()).toContain(corrected);

    await view.pressOutside();

    expect(view.text()).not.toContain(corrected);
  });

  // The signal clamped it long ago; what was missing was the field agreeing.
  // A nought cannot be sold, so it is corrected to the smallest the shop
  // sells: ten packs of ten here, not one.
  it('writes a nought quantity back as the minimum on the way out', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.pack);

    await view.type('0');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('10');
  });

  // An emptied field asked for nothing at all, which is not the same as asking
  // for none: the quantity that stands is kept and written back over the blank,
  // rather than the line dropping to the minimum because a figure was cleared
  // on the way to retyping it.
  it('writes the standing quantity back over an emptied field', async () => {
    const view = await render(packaged);
    await view.chooseUnit(unitText.select.pack);
    await view.type('15');
    await view.blurQuantity();
    expect(view.quantityInput().value).toBe('15');

    await view.type('');
    await view.blurQuantity();

    expect(view.quantityInput().value).toBe('15');
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
  // its own button adds, with a note or without.
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

  // In the cart these controls edit the line, the note too, written when the
  // field is left.
  it('writes the note straight onto a line already in the cart', async () => {
    const view = await render(noted);
    await view.click(text.add);

    await view.click(text.noteAdd);
    await view.typeNote('Sand only');

    expect(view.cart.lines()[0].note).toBe('Sand only');
  });

  // On a phone the keyboard leaves no room for a bubble, so the field is a
  // modal, and with no "click away" its button records the text.
  it('opens the note as a modal on a phone', async () => {
    onNarrowScreen();
    const view = await render(noted);

    await view.click(text.noteAdd);
    expect(view.el.querySelector('dialog')).not.toBe(null);

    const field = view.noteField() as HTMLTextAreaElement;
    field.value = 'Slate only';
    field.dispatchEvent(new Event('input'));
    await view.click(defaultSharedText.actions.done);

    expect(view.el.querySelector('dialog')).toBe(null);
    await view.click(text.add);
    expect(view.cart.lines()[0].note).toBe('Slate only');
  });

  // Cancel is not "close": what was typed is dropped, including the line
  // already in the cart, which the field's own blur has by then recorded.
  it('puts the old note back when the modal is cancelled', async () => {
    onNarrowScreen();
    const view = await render(noted);
    await view.click(text.noteAdd);
    await view.typeNote('Sand only');
    await view.click(defaultSharedText.actions.done);
    await view.click(text.add);

    // Typed and left, which is the sequence pressing Cancel really makes: the
    // press takes the focus out of the field first.
    await view.click(text.noteEdit);
    await view.typeNote('Slate after all');
    expect(view.cart.lines()[0].note).toBe('Slate after all');
    await view.click(defaultSharedText.actions.cancel);

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

  /** Out of stock (FR-STOCK-04): listed, reachable and priced, but not
   * addable to the cart, in every view. */
  describe('out of stock', () => {
    const empty = productDetail({
      ...packaged,
      availability: 'out',
    }) as ProductDetail;

    it('takes every control out of use', async () => {
      const view = await render(empty);

      // No segment is selectable: disabled buttons, as a line that cannot be
      // bought has nothing to say per unit.
      expect(view.el.querySelectorAll('[role=radiogroup] input')).toHaveLength(
        0,
      );
      const segments = [
        ...view.el.querySelectorAll<HTMLButtonElement>(
          '[role=radiogroup] button',
        ),
      ];
      expect(segments).toHaveLength(3);
      expect(segments.every((segment) => segment.disabled)).toBe(true);

      expect(view.quantityInput().disabled).toBe(true);
      expect(
        view.el.querySelector<HTMLButtonElement>(
          `[aria-label="${defaultSharedCatalogText.buying.increaseAria}"]`,
        )?.disabled,
      ).toBe(true);
      expect(
        view.el.querySelector<HTMLButtonElement>(
          `[aria-label="${defaultSharedCatalogText.buying.decreaseAria}"]`,
        )?.disabled,
      ).toBe(true);
    });

    it('keeps the price and offers a button that refuses the press', async () => {
      const view = await render(empty);

      // Priced, as the requirement says: what is refused is the buying, not
      // the telling.
      expect(view.text()).not.toContain(
        defaultSharedCatalogText.buying.noPrice,
      );

      const add = [...view.el.querySelectorAll('button')].find((button) =>
        (button.textContent ?? '').includes(text.add),
      );
      expect(add?.disabled).toBe(true);

      await view.click(text.add);
      expect(view.cart.count()).toBe(0);
    });

    it('restricts nothing where only a few are left', async () => {
      const view = await render(
        productDetail({ ...packaged, availability: 'low' }) as ProductDetail,
      );

      expect(view.quantityInput().disabled).toBe(false);
      await view.click(text.add);
      expect(view.cart.count()).toBe(1);
    });
  });
});
