import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { defaultSharedText } from '../../../shared/config/shared-text.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { defaultStorefrontText } from '../../../shared/config/storefront-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../../shared/config/deployment-config.fixture';
import { PairingsService } from './pairings.service';
import { ProductBuyControls } from './product-buy-controls';
import { ProductPairings } from './product-pairings';
import { productDetail } from '../product.fixture';

const text = defaultStorefrontText.catalog.pairings;

async function render(
  variant: 'marker' | 'link',
  count = 2,
  message: { link: string; rest: string } | null = null,
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductPairings],
    providers: [
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
    ],
  });

  const fixture = TestBed.createComponent(ProductPairings);
  fixture.componentRef.setInput('slug', 'takeaway-cup');
  fixture.componentRef.setInput('count', count);
  fixture.componentRef.setInput('variant', variant);
  fixture.componentRef.setInput('message', message);
  await fixture.whenStable();

  return {
    el: fixture.nativeElement as HTMLElement,
    pairings: TestBed.inject(PairingsService),
  };
}

describe('the sold-together marker (FR-SET-05)', () => {
  it('says how many the panel will hold, without naming them', async () => {
    const { el } = await render('marker');
    const button = el.querySelector('button');

    // The glyph alone in a price row, so the count is the accessible name
    // rather than anything on screen: a card has no line to spare for it.
    expect(button?.getAttribute('aria-label')).toBe(
      fillText(text.marker, { count: 2 }),
    );
    expect(button?.textContent?.trim()).toBe('');
    expect(el.querySelector('ui-icon')).not.toBeNull();
  });

  it('names the thing where there is a line to spare', async () => {
    const { el } = await render('link');

    expect(el.querySelector('button')?.textContent).toContain(
      defaultSharedText.product.pairings,
    );
  });

  // FR-SET-03: on a cart line the same control says what the line is short of
  // instead of its own name, and only the half that is the answer is pressable.
  it('says what it was given instead of its own name', async () => {
    const { el } = await render('link', 2, {
      link: 'Add 20 pc',
      rest: 'of what this is sold with.',
    });

    expect(el.querySelector('button')?.textContent?.trim()).toBe('Add 20 pc');
    expect(el.textContent).toContain('of what this is sold with.');
    expect(el.textContent).not.toContain(defaultSharedText.product.pairings);
  });

  it('opens the one panel, naming the product it was pressed on', async () => {
    const { el, pairings } = await render('marker', 3);
    expect(pairings.open()).toBeNull();

    el.querySelector('button')?.click();

    // The count travels with it, so the panel has a heading before it has an
    // answer.
    expect(pairings.open()).toEqual({ slug: 'takeaway-cup', count: 3 });
  });
});

/** jsdom's <dialog> has no showModal/close, and the note editor opens one. */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

async function renderControls(pairedCount: number, offerPairings = true) {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductBuyControls],
    providers: [
      provideRouter([]),
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });

  const fixture = TestBed.createComponent(ProductBuyControls);
  fixture.componentRef.setInput('item', productDetail({ pairedCount }));
  fixture.componentRef.setInput('offerPairings', offerPairings);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('where the marker sits', () => {
  it('rides in the price row of the buying controls', async () => {
    const el = await renderControls(2);

    // The same corner the note's bubble is in — the one place on these
    // controls a thing belongs that is neither a choice nor the action.
    expect(el.querySelector('app-product-pairings')).not.toBeNull();
  });

  it('is absent where the product is sold with nothing', async () => {
    expect(
      (await renderControls(0)).querySelector('app-product-pairings'),
    ).toBeNull();
  });

  it('is absent where the caller draws the counterparts itself', async () => {
    // The product page and the cart give them a line and a word; two ways to
    // open one panel, side by side, is one too many.
    expect(
      (await renderControls(2, false)).querySelector('app-product-pairings'),
    ).toBeNull();
  });
});
