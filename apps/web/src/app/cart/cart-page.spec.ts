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
    prices: { pieceLotMinor: 7500, pack: 7000, box: 27000 },
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
  } = {},
) {
  localStorage.clear();
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
    rowLabels: () => [...el.querySelectorAll('dt')].map((d) => d.textContent),
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

  it('renders a line with what it is, how much of it, and what it costs', async () => {
    const view = await render({ lines: [addition()] });

    expect(view.rows()).toHaveLength(1);
    expect(view.text()).toContain('Filter Roast');
    expect(view.text()).toContain('2 × Pack');
    expect(view.text()).toContain('140,00');
  });

  it('shows a line note where one was left', async () => {
    const view = await render({
      lines: [addition({ note: '100 in red' })],
      answer: preview([{ note: '100 in red' }]),
    });

    expect(view.text()).toContain('100 in red');
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

    expect(view.rowLabels()).toEqual([
      text.shipmentCartons,
      text.shipmentVolume,
      text.shipmentWeight,
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

    expect(view.rowLabels()).toEqual([text.subtotal]);
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

  it('asks before emptying the cart, and does nothing when told not to', async () => {
    const view = await render({ lines: [addition()], confirm: false });

    await view.click(text.clear);

    expect(view.confirmed).toHaveBeenCalled();
    expect(view.cart.count()).toBe(1);
  });

  it('empties the cart once confirmed', async () => {
    const view = await render({ lines: [addition()] });

    await view.click(text.clear);

    expect(view.cart.isEmpty()).toBe(true);
    expect(view.text()).toContain(text.empty);
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
