import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CartPreview } from '@b2b-catalog-platform/shared';
import { packagedPackaging } from '../catalog/product.fixture';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { ConfirmService } from '../ui/confirm.service';
import { CartPage } from './cart-page';
import { CartPreviewService } from './cart-preview.service';
import { CartAddition, CartService } from './cart.service';

const text = defaultAppText.cart;

function addition(overrides: Partial<CartAddition> = {}): CartAddition {
  return {
    slug: 'filter-roast',
    name: 'Filter Roast',
    unit: 'pack',
    // Two packs of the six-piece pack the fixture is packed in.
    pieces: 12,
    note: null,
    image: null,
    lineNoteEnabled: false,
    lineNotePrompt: null,
    pairedCount: 0,
    availability: null,
    prices: {
      pieceMilliMinor: 1_166_667,
      pieceLotMinor: 7000,
      pack: 7000,
      box: 28_000,
    },
    packaging: { ...packagedPackaging },
    ...overrides,
  };
}

function preview(
  lines: Partial<CartPreview['lines'][number]>[],
  shipment: Partial<CartPreview['shipment']> = {},
): CartPreview {
  const priced = lines.map((line) => ({
    slug: 'filter-roast',
    unit: 'pack' as const,
    pieces: 12,
    note: null,
    name: 'Filter Roast',
    image: null,
    packaging: { ...packagedPackaging },
    boxVolume: null,
    boxWeight: null,
    boxCount: 1,
    lineNoteEnabled: false,
    lineNotePrompt: null,
    pairedCount: 0,
    availability: null,
    prices: {
      pieceMilliMinor: 1_166_667,
      pieceLotMinor: 7000,
      pack: 7000,
      box: 28_000,
    },
    lineTotalMinor: 14000,
    issues: [],
    ...line,
  }));
  return {
    lines: priced,
    totalMinor: priced.reduce((sum, l) => sum + (l.lineTotalMinor ?? 0), 0),
    complete: priced.every((l) => l.lineTotalMinor !== null),
    shipment: {
      cartons: 0,
      volume: null,
      weight: null,
      coveredLines: 0,
      uncoveredLines: 0,
      approximate: true,
      ...shipment,
    },
  };
}

async function render(
  options: {
    lines?: CartAddition[];
    /** One answer for every call, or a run of them — the page re-prices the
     * cart whenever it folds one in, so a second answer is what the first one
     * made true. The last is repeated once the run is spent. */
    answer?: CartPreview | Error | CartPreview[];
    confirm?: boolean;
    /** Keeps what the last render wrote down — a reload, not a first visit. */
    reload?: boolean;
  } = {},
) {
  if (!options.reload) localStorage.clear();
  TestBed.resetTestingModule();

  const answers = options.answer ?? preview([{}]);
  let call = 0;
  const priced = vi.fn(() => {
    if (answers instanceof Error) return Promise.reject(answers);
    if (!Array.isArray(answers)) return Promise.resolve(answers);
    return Promise.resolve(answers[Math.min(call++, answers.length - 1)]);
  });
  const confirmed = vi.fn(() => Promise.resolve(options.confirm ?? true));

  TestBed.configureTestingModule({
    imports: [CartPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: CartPreviewService, useValue: { preview: priced } },
      { provide: ConfirmService, useValue: { ask: confirmed } },
    ],
  });

  const cart = TestBed.inject(CartService);
  for (const line of options.lines ?? []) cart.add(line);

  const fixture = TestBed.createComponent(CartPage);
  const rerender = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await rerender();
  // The request is debounced, so the first answer only lands after the pause.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await rerender();

  const el = fixture.nativeElement as HTMLElement;
  return {
    cart,
    priced,
    confirmed,
    el,
    rerender,
    text: () => (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    /** The cart's lines. By the row component, not by `li`: the change
     * summary above them is a list too. */
    rows: () => el.querySelectorAll('app-product-row'),
    /** The rows' own tick boxes — the one above the list has no line to name. */
    boxes: () =>
      [
        ...el.querySelectorAll('input[type=checkbox][aria-label]'),
      ] as HTMLInputElement[],
    /** The tick box above the list, which applies to all of them. */
    selectAll: async () => {
      (
        el.querySelector(
          'input[type=checkbox]:not([aria-label])',
        ) as HTMLInputElement | null
      )?.click();
      await rerender();
      await rerender();
    },
    /** The quantity the row's stepper holds. By its label, not its input
     * mode: the field takes decimals in every unit but the piece. */
    quantities: () =>
      [
        ...el.querySelectorAll(
          `input[aria-label="${defaultAppText.cart.quantityLabel}"]`,
        ),
      ].map((input) => (input as HTMLInputElement).value),
    rowLabels: () => [...el.querySelectorAll('dt')].map((d) => d.textContent),
    /** The first row's quantity field. */
    quantityInput: () =>
      el.querySelector(
        `input[aria-label="${defaultAppText.cart.quantityLabel}"]`,
      ) as HTMLInputElement,
    async type(value: string) {
      const input = el.querySelector(
        `input[aria-label="${defaultAppText.cart.quantityLabel}"]`,
      ) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await rerender();
    },
    async blurQuantity() {
      (
        el.querySelector(
          `input[aria-label="${defaultAppText.cart.quantityLabel}"]`,
        ) as HTMLInputElement
      ).dispatchEvent(new Event('blur'));
      await rerender();
    },
    /** A press landing outside any bubble — what dismisses one. */
    async pressOutside() {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
      await rerender();
    },
    /** The photos the rows are drawn with, in order. */
    photos: () =>
      [...el.querySelectorAll('app-tile-gallery img')].map((img) =>
        img.getAttribute('src'),
      ),
    /** Presses one of a row's unit segments. */
    async chooseUnit(label: string) {
      const segment = [...el.querySelectorAll('label')].find((l) =>
        (l.textContent ?? '').trim().startsWith(label),
      );
      (segment?.querySelector('input') as HTMLInputElement | null)?.click();
      await rerender();
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
      await rerender();
    },
  };
}

describe('CartPage', () => {
  it('says the cart is empty, and asks for nothing to price', async () => {
    const view = await render();

    expect(view.text()).toContain(text.empty);
    expect(view.priced).not.toHaveBeenCalled();
  });

  // The line is the product row a listing draws: the quantity lives in the
  // stepper that changes it, and what the line costs is where the add button
  // would be on a product that is not in the cart yet.
  it('renders a line with what it is, how much of it, and what it costs', async () => {
    const view = await render({ lines: [addition()] });

    expect(view.rows()).toHaveLength(1);
    expect(view.text()).toContain('Filter Roast');
    expect(view.quantities()).toEqual(['2']);
    expect(view.text()).toContain('140,00');
  });

  it('edits the line in place from the row’s own controls', async () => {
    const view = await render({ lines: [addition()] });

    await view.click(text.increase);

    expect(view.cart.lines()[0].pieces).toBe(18);
    expect(view.quantities()).toEqual(['3']);
  });

  // The photo is the line's own, not the answer's: a row drawn from whatever
  // the last call returned blanks itself for as long as the next one is in
  // flight — the row blinked on every edit.
  it('keeps a line’s photo when its unit changes', async () => {
    const image = { thumb: '/media/thumb.webp', full: '/media/full.webp' };
    const view = await render({
      lines: [addition({ image })],
      answer: preview([{ image }]),
    });
    expect(view.photos()).toEqual(['/media/thumb.webp']);

    await view.chooseUnit(defaultAppText.catalog.units.boxName);

    // The unit really did change, and the row kept everything it had.
    expect(view.cart.lines()[0].unit).toBe('box');
    expect(view.photos()).toEqual(['/media/thumb.webp']);
  });

  // A correction is feedback on something already done, so it goes in the
  // bubble under the stepper it is about — not into the list of states under
  // the name, which the customer would have to read and then ignore.
  it('shows a corrected quantity in a bubble, not as a line of text', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([{ pieces: 18, issues: ['quantity-corrected'] }]),
    });

    expect(view.text()).toContain(text.issues.quantityCorrected);
    expect(view.el.querySelector('app-popover')?.textContent).toContain(
      text.issues.quantityCorrected,
    );
  });

  // The states that are not feedback stay where they were: they describe the
  // line until something is done about them.
  it('leaves a line’s standing problems as text under its name', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([
        { prices: null, lineTotalMinor: null, issues: ['unavailable'] },
      ]),
    });

    expect(view.el.querySelector('app-popover')).toBeNull();
    expect(view.text()).toContain(text.issues.unavailable);
  });

  // The bug the product page had first, and the cart shares the component: a
  // field derived from the piece count is rewritten between keystrokes, so
  // backspacing 0,5 to 0, put the division back on the caret.
  it('leaves a row’s field alone until it is left', async () => {
    const view = await render({
      lines: [addition({ unit: 'box' })],
      answer: preview([{ unit: 'box' }]),
    });
    expect(view.quantities()).toEqual(['0,5']);

    await view.type('0,');
    expect(view.quantityInput().value).toBe('0,');

    await view.blurQuantity();
    expect(view.quantityInput().value).toBe('0,25');
  });

  // Same reason: the header and the subtotal are added up from the lines, so a
  // quantity nobody can be sold made both flicker between two keystrokes.
  it('holds the subtotal still while a quantity is being typed', async () => {
    const view = await render({ lines: [addition()] });
    expect(view.text()).toContain('140,00');

    await view.type('3');

    expect(view.text()).toContain('140,00');
    expect(view.cart.totalComplete()).toBe(true);

    await view.blurQuantity();

    // Three packs' worth of pieces is under the six-piece minimum only in the
    // piece lens; here 3 pk is 18 pieces, at 70,00 the pack.
    expect(view.text()).toContain('210,00');
  });

  // The correction is over by the time it can be read: folding the answer in
  // writes the corrected line back and asks again, and that second answer has
  // nothing left to report. A bubble bound to the answer itself closed on it,
  // seconds short of the time it is given.
  it('holds the correction bubble up once the cart has been re-priced', async () => {
    const view = await render({
      lines: [addition()],
      answer: [
        preview([{ pieces: 18, issues: ['quantity-corrected'] }]),
        preview([{ pieces: 18 }]),
      ],
    });

    // The write-back re-prices the cart, and the second answer is clean.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await view.rerender();

    expect(view.priced.mock.calls.length).toBeGreaterThan(1);
    expect(view.el.querySelector('app-popover')?.textContent).toContain(
      text.issues.quantityCorrected,
    );
  });

  // A product repacked out of the unit its line was read in is not refused:
  // the pieces are untouched and the lens falls back to them. That is
  // something that happened, so it goes where the other feedback goes.
  it('states a moved lens in the bubble rather than under the name', async () => {
    const view = await render({
      lines: [addition({ unit: 'box' })],
      answer: preview([{ unit: 'piece', issues: ['unit-unavailable'] }]),
    });

    expect(view.el.querySelector('app-popover')?.textContent).toContain(
      text.issues.unitUnavailable,
    );
  });

  // A bubble is waved away like any other, not only waited out.
  it('lets the correction bubble be dismissed by a click elsewhere', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([{ pieces: 18, issues: ['quantity-corrected'] }]),
    });
    expect(view.el.querySelector('app-popover')).not.toBeNull();

    await view.pressOutside();

    expect(view.el.querySelector('app-popover')).toBeNull();
  });

  // The figures are on the lines, so the estimate is the cart's own
  // arithmetic — a reload draws the card complete without asking anything.
  it('adds the shipment estimate up from the lines it was told', async () => {
    await render({
      lines: [addition()],
      // Half a box (2 packs of the 4 a box holds), shipped as three cartons.
      answer: preview([
        { boxVolume: '0.120', boxWeight: '15.000', boxCount: 3 },
      ]),
    });

    // A reload: the same browser, the same stored cart, and a call that never
    // answers this time.
    const view = await render({ reload: true, answer: new Error('offline') });

    expect(view.text()).toContain('7.500');
    expect(view.text()).toContain('0.060');
    expect(view.rowLabels()).toContain(text.shipmentCartons);
  });

  // The point of holding the figures: what the order weighs follows the
  // stepper, exactly as the subtotal does, rather than a round trip behind it.
  it('re-adds the estimate as the quantity is changed, before any answer', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview(
        [{ boxVolume: '0.120', boxWeight: '15.000', boxCount: 3 }],
        { cartons: 2, volume: '0.060', weight: '7.500', coveredLines: 1 },
      ),
    });
    expect(view.text()).toContain('7.500');

    // Two packs to three, which is three quarters of a box.
    await view.click(text.increase);

    expect(view.quantities()).toEqual(['3']);
    expect(view.text()).toContain('11.250');
    expect(view.text()).not.toContain('7.500');
  });

  // Drawn from the browser's own copy, so a reload has the row complete on the
  // first frame rather than after the pricing call.
  it('draws a row before anything has been priced', async () => {
    const image = { thumb: '/media/thumb.webp', full: '/media/full.webp' };
    const view = await render({
      lines: [addition({ image })],
      answer: new Error('offline'),
    });

    expect(view.photos()).toEqual(['/media/thumb.webp']);
    expect(view.text()).toContain('Filter Roast');
  });

  // FR-CART-08 on the cart: a field, not a bubble — this is the page where a
  // note is re-read before the order goes in.
  it('writes a line note from the field under the row', async () => {
    const view = await render({
      lines: [addition({ lineNoteEnabled: true })],
      answer: preview([{ lineNoteEnabled: true }]),
    });

    const field = view.el.querySelector('textarea');
    expect(field).not.toBeNull();
    const note = field as HTMLTextAreaElement;
    note.value = 'Three sand, three slate';
    // On change: the note is recorded when the field is left.
    note.dispatchEvent(new Event('change'));
    await view.rerender();

    expect(view.cart.lines()[0].note).toBe('Three sand, three slate');
  });

  it('offers no note field for a product that takes none', async () => {
    const view = await render({ lines: [addition()] });

    expect(view.el.querySelector('textarea')).toBeNull();
  });

  // FR-SET-05 on the cart: the word, not the glyph — this line has a column to
  // spare for it, and the panel is worth naming before it is opened.
  it('names the counterparts above the note, and only where there are any', async () => {
    const paired = await render({
      lines: [addition({ pairedCount: 2, lineNoteEnabled: true })],
      answer: preview([{ pairedCount: 2, lineNoteEnabled: true }]),
    });

    const link = paired.el.querySelector('app-product-pairings');
    const field = paired.el.querySelector('textarea');
    if (!link || !field) throw new Error('expected both the link and the note');
    expect(link.textContent).toContain(defaultAppText.catalog.pairings.label);
    // Above the note, because it is something the shop says about the product
    // and the note is something the customer writes about the line.
    expect(
      link.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const alone = await render({ lines: [addition()] });
    expect(alone.el.querySelector('app-product-pairings')).toBeNull();
  });

  // The row's own controls do not also carry the glyph: two ways to open one
  // panel, side by side, is one too many.
  it("leaves the marker off the row's controls", async () => {
    const view = await render({
      lines: [addition({ pairedCount: 2 })],
      answer: preview([{ pairedCount: 2 }]),
    });

    expect(view.el.querySelectorAll('app-product-pairings')).toHaveLength(1);
  });

  // In the field that edits it, not as a sentence beside the name: one note,
  // one place, and it is the place it is changed.
  it('shows a line note where one was left', async () => {
    const view = await render({
      lines: [addition({ note: '100 in red', lineNoteEnabled: true })],
      answer: preview([{ note: '100 in red', lineNoteEnabled: true }]),
    });

    const field = view.el.querySelector(
      'textarea',
    ) as HTMLTextAreaElement | null;
    expect(field?.value).toBe('100 in red');
  });

  // Preview is the authority on price, and its answer becomes the cart's own
  // baseline — so the header and this page cannot disagree.
  it('takes the fresh price over the stored one and writes it back', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([{ lineTotalMinor: 15000 }]),
    });

    expect(view.text()).toContain('150,00');
    expect(view.cart.lines()[0].lineTotalMinor).toBe(15000);
  });

  it('says what is wrong with a line rather than dropping it', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([
        {
          name: null,
          prices: null,
          packaging: null,
          lineTotalMinor: null,
          issues: ['unavailable'],
        },
      ]),
    });

    expect(view.rows()).toHaveLength(1);
    expect(view.text()).toContain(text.issues.unavailable);
    // The stored name stands in, because an unavailable line answers none.
    expect(view.text()).toContain('Filter Roast');
    expect(view.text()).toContain(text.noPrice);
  });

  // The row is drawn from the browser's own copy, which keeps the last-known
  // prices so the controls can be drawn at all. Without the availability the
  // cart writes down, coming back to the page would show the withdrawn
  // product's old price again until the pricing call answered.
  it('keeps a withdrawn line unpriced before an answer arrives', async () => {
    await render({
      lines: [addition()],
      answer: preview([
        {
          name: null,
          prices: null,
          packaging: null,
          lineTotalMinor: null,
          issues: ['unavailable'],
        },
      ]),
    });

    // The same cart, opened again with nothing yet answered for it.
    const view = await render({ reload: true, answer: new Error('offline') });

    expect(view.text()).toContain(text.noPrice);
    expect(view.text()).toContain(text.issues.unavailable);
    expect(view.text()).not.toContain('140,00');
  });

  // There is no quantity of a withdrawn product to choose, and letting one be
  // chosen moved a total the shop is no longer offering.
  it('takes no input on a line it cannot price', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([
        {
          name: null,
          prices: null,
          packaging: null,
          lineTotalMinor: null,
          issues: ['unavailable'],
        },
      ]),
    });

    expect(view.quantityInput().disabled).toBe(true);
    const controls = [
      ...view.el.querySelectorAll('app-product-row button'),
    ] as HTMLButtonElement[];
    for (const label of [text.decrease, text.increase]) {
      const key = controls.find((b) => b.getAttribute('aria-label') === label);
      expect(key?.disabled).toBe(true);
    }
    // Every unit segment with it: the row says once, above them, why none of
    // them can be pressed.
    const units = controls.filter((b) => b.getAttribute('aria-label') === null);
    expect(units.length).toBeGreaterThan(0);
    expect(units.every((b) => b.disabled)).toBe(true);
  });

  it('flags a subtotal that covers only part of the cart', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([
        { lineTotalMinor: null, issues: ['price-unavailable'] },
      ]),
    });

    expect(view.text()).toContain(text.totalIncomplete);
  });

  it('states the shipment estimate as rows, approximate, and what it misses', async () => {
    const view = await render({
      lines: [addition()],
      answer: preview([{}], {
        cartons: 3,
        volume: '1.250',
        weight: '18.400',
        coveredLines: 1,
        uncoveredLines: 2,
      }),
    });

    // What the order is, then what it weighs and measures, then what that
    // comes to in cartons. Nothing about how or when it arrives: the cart has
    // not asked, and a row of placeholders answers nothing.
    expect(view.rowLabels()).toEqual([
      text.summaryLines,
      text.shipmentWeight,
      text.shipmentVolume,
      text.shipmentCartons,
      text.subtotal,
    ]);
    expect(view.text()).toContain('1.250');
    expect(view.text()).toContain('18.400');
    expect(view.text()).toContain(text.shipmentApproximate);
    expect(view.text()).toContain('Lines not covered by this estimate: 2');
  });

  // The card still has to state the total, so it stays — with nothing above
  // the subtotal rather than a row of zeroes the estimate cannot vouch for.
  it('leaves out every estimate row when the estimate covers nothing', async () => {
    const view = await render({ lines: [addition()] });

    expect(view.rowLabels()).toEqual([text.summaryLines, text.subtotal]);
    expect(view.text()).not.toContain(text.shipmentApproximate);
  });

  it('removes one line at the customer’s word', async () => {
    const view = await render({
      lines: [addition(), addition({ slug: 'espresso-roast', unit: 'piece' })],
    });
    expect(view.rows()).toHaveLength(2);

    await view.click('Remove Filter Roast');

    expect(view.cart.count()).toBe(1);
    expect(view.cart.lines()[0].slug).toBe('espresso-roast');
  });

  it('deletes nothing until something is ticked', async () => {
    const view = await render({ lines: [addition()] });

    await view.click(text.deleteSelected);

    expect(view.confirmed).not.toHaveBeenCalled();
    expect(view.cart.count()).toBe(1);
  });

  it('deletes the ticked lines and leaves the rest', async () => {
    const view = await render({
      lines: [addition(), addition({ slug: 'espresso-roast', unit: 'piece' })],
    });

    view.boxes()[0].click();
    await view.rerender();
    await view.click(text.deleteSelected);

    expect(view.confirmed).toHaveBeenCalled();
    expect(view.cart.count()).toBe(1);
    expect(view.cart.lines()[0].slug).toBe('espresso-roast');
  });

  it('asks before deleting a selection, and does nothing when told not to', async () => {
    const view = await render({ lines: [addition()], confirm: false });

    await view.selectAll();
    await view.click(text.deleteSelected);

    expect(view.confirmed).toHaveBeenCalled();
    expect(view.cart.count()).toBe(1);
  });

  // What "empty the cart" used to be, in the two controls that already exist.
  it('empties the cart by selecting every line and deleting the selection', async () => {
    const view = await render({
      lines: [addition(), addition({ slug: 'espresso-roast', unit: 'piece' })],
    });

    await view.selectAll();
    expect(view.boxes().every((box) => box.checked)).toBe(true);

    await view.click(text.deleteSelected);

    expect(view.cart.isEmpty()).toBe(true);
    expect(view.text()).toContain(text.empty);
  });

  it('gives the ticks back rather than offering the whole cart twice', async () => {
    const view = await render({ lines: [addition()] });

    await view.selectAll();
    await view.selectAll();

    expect(view.boxes().some((box) => box.checked)).toBe(false);
  });

  // A pricing failure must not take the cart with it: the lines and the
  // last-seen figures are the browser's own.
  it('keeps showing the cart when pricing it fails', async () => {
    const view = await render({
      lines: [addition()],
      answer: new Error('offline'),
    });

    expect(view.text()).toContain(text.loadError);
    expect(view.rows()).toHaveLength(1);
    expect(view.text()).toContain('140,00');
  });

  // FR-CART-02. A cart row is a product row, so a long cart is a long scroll;
  // the pager is the catalog's own, in the catalog's words.
  it('pages a long cart, ten lines at a time', async () => {
    const slugs = Array.from({ length: 12 }, (_, at) => `line-${at}`);
    const view = await render({
      lines: slugs.map((slug) => addition({ slug })),
      answer: preview(slugs.map((slug) => ({ slug }))),
    });

    expect(view.rows()).toHaveLength(10);
    expect(view.text()).toContain('Page 1 of 2');

    await view.click(defaultAppText.catalog.nextPage);

    expect(view.rows()).toHaveLength(2);
    expect(view.text()).toContain('Page 2 of 2');
  });

  // Emptying the last page leaves the customer standing on a page that no
  // longer exists, and a cart answering with nothing reads as an empty one.
  it('falls back to a page that still exists when the last one is emptied', async () => {
    const slugs = Array.from({ length: 11 }, (_, at) => `line-${at}`);
    const view = await render({
      lines: slugs.map((slug) => addition({ slug })),
      answer: preview(slugs.map((slug) => ({ slug }))),
    });

    await view.click(defaultAppText.catalog.nextPage);
    expect(view.rows()).toHaveLength(1);

    view.cart.remove('line-10');
    await view.rerender();

    expect(view.rows()).toHaveLength(10);
    expect(view.text()).not.toContain('Page 2 of 1');
  });

  // FR-CART-10: what moved while the cart sat, said once, above the lines it
  // is about.
  it('reports what changed while the cart waited, until it is dismissed', async () => {
    await render({ lines: [addition()] });
    const view = await render({
      reload: true,
      answer: preview([{ lineTotalMinor: 15000 }]),
    });

    expect(view.text()).toContain(text.changes.heading);
    expect(view.text()).toContain('Filter Roast');
    expect(view.text()).toContain('150,00');

    await view.click(text.changes.dismiss);

    expect(view.text()).not.toContain(text.changes.heading);
  });

  it('says nothing about a cart the shop still describes the same way', async () => {
    await render({ lines: [addition()] });
    const view = await render({ reload: true });

    expect(view.text()).not.toContain(text.changes.heading);
  });

  it('warns when the browser will not keep the cart', async () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
    const view = await render({ lines: [addition()] });

    expect(view.text()).toContain(text.storageFailed);
    setItem.mockRestore();
  });
});
