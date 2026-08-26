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
    quantity: 2,
    note: null,
    image: null,
    prices: {
      pieceMilliMinor: 1250,
      pieceLotMinor: 7500,
      pack: 7000,
      box: 27000,
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
    quantity: 2,
    note: null,
    name: 'Filter Roast',
    image: null,
    packaging: { ...packagedPackaging },
    boxVolume: null,
    boxWeight: null,
    boxCount: 1,
    prices: {
      pieceMilliMinor: 1250,
      pieceLotMinor: 7500,
      pack: 7000,
      box: 27000,
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
    answer?: CartPreview | Error;
    confirm?: boolean;
    /** Keeps what the last render wrote down — a reload, not a first visit. */
    reload?: boolean;
  } = {},
) {
  if (!options.reload) localStorage.clear();
  TestBed.resetTestingModule();

  const answer = options.answer ?? preview([{}]);
  const priced = vi.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  );
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
    rows: () => el.querySelectorAll('li'),
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
    /** The quantity the row's stepper holds. */
    quantities: () =>
      [...el.querySelectorAll('input[inputmode=numeric]')].map(
        (input) => (input as HTMLInputElement).value,
      ),
    rowLabels: () => [...el.querySelectorAll('dt')].map((d) => d.textContent),
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

    expect(view.cart.lines()[0].quantity).toBe(3);
    expect(view.quantities()).toEqual(['3']);
  });

  // The photo is the line's own, not the answer's: an answer is filed under
  // the product *and its unit*, so choosing a different unit left the row
  // without one until the next call came back — the row blinked.
  it('keeps a line’s photo when its unit changes', async () => {
    const image = { thumb: '/media/thumb.webp', full: '/media/full.webp' };
    const view = await render({
      lines: [addition({ image })],
      answer: preview([{ image }]),
    });
    expect(view.photos()).toEqual(['/media/thumb.webp']);

    await view.chooseUnit(defaultAppText.catalog.units.boxName);

    // The unit really did change — the answer on hand is now filed under the
    // old one, which is the state the row used to blank itself in.
    expect(view.cart.lines()[0].unit).toBe('box');
    expect(view.photos()).toEqual(['/media/thumb.webp']);
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
    // comes to in cartons, then when it is confirmed.
    expect(view.rowLabels()).toEqual([
      text.summaryLines,
      text.shipmentWeight,
      text.shipmentVolume,
      text.shipmentCartons,
      text.shipmentDelivery,
      text.subtotal,
    ]);
    expect(view.text()).toContain('1.250');
    expect(view.text()).toContain('18.400');
    // Not a date: the shop has not agreed to one yet.
    expect(view.text()).toContain(text.shipmentDeliveryValue);
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
