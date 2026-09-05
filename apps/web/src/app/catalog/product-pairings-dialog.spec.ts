import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { CatalogService } from './catalog.service';
import { PairingsService } from './pairings.service';
import { ProductPairingsDialog } from './product-pairings-dialog';
import { productListItem } from './product.fixture';

const text = defaultAppText.catalog.pairings;

/** jsdom's <dialog> has neither; the panel opens itself once it has content. */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

const LID = productListItem({
  slug: 'takeaway-lid-flat',
  name: 'Takeaway Lid, Flat',
  pairedCount: 1,
});

async function render(
  answer: (slug: string) => Promise<ProductListItem[] | null>,
) {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductPairingsDialog],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      {
        provide: CatalogService,
        useValue: {
          getProductPairings: (slug: string) => {
            asked.push(slug);
            return answer(slug);
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(ProductPairingsDialog);
  await fixture.whenStable();
  const pairings = TestBed.inject(PairingsService);

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return {
    asked,
    pairings,
    settle,
    /** A repaint without waiting for anything: `whenStable` blocks on a
     * pending resource, which is the state some of these are about. */
    paint: () => fixture.detectChanges(),
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('the sold-together panel (FR-SET-05)', () => {
  it('asks nothing until a marker is pressed', async () => {
    const { asked, el } = await render(async () => [LID]);

    // Every card in a listing carries a marker; a panel that fetched on render
    // would price the whole grid's counterparts to draw an icon.
    expect(asked).toEqual([]);
    expect(el.querySelector('dialog')).toBeNull();
  });

  it('opens on its content rather than filling in a beat later', async () => {
    let answer!: (items: ProductListItem[]) => void;
    const { pairings, settle, paint, el } = await render(
      () => new Promise<ProductListItem[]>((resolve) => (answer = resolve)),
    );

    pairings.show('takeaway-cup-300', 1);
    paint();
    // Pressed, asked, and nothing drawn yet: a modal that arrives empty moves
    // everything the customer was about to press.
    expect(el.querySelector('dialog')).toBeNull();

    answer([LID]);
    await settle();
    expect(el.querySelector('dialog')).not.toBeNull();
    expect(el.textContent).toContain(LID.name);
  });

  it('holds a place for each counterpart the marker promised', async () => {
    const { pairings, paint, el } = await render(
      () => new Promise<ProductListItem[]>(() => undefined),
    );

    pairings.show('takeaway-cup-300', 2);
    paint();
    // Nothing yet — the panel opens on its content, and 150ms have not passed.
    expect(el.querySelector('dialog')).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 200));
    paint();

    // Two placeholders for two counterparts, so the panel opens at the size it
    // will settle at rather than growing under the pointer.
    expect(el.querySelectorAll('app-skeleton')).toHaveLength(2);
  });

  it('lists the counterparts with their own way to buy them', async () => {
    const { pairings, settle, el, asked } = await render(async () => [LID]);

    pairings.show('takeaway-cup-300', 1);
    await settle();

    expect(asked).toEqual(['takeaway-cup-300']);
    expect(el.textContent).toContain(LID.name);
    // A product row, so the counterpart can be added from where the marker was
    // pressed rather than by going to find it.
    expect(el.querySelector('app-product-buy-controls')).not.toBeNull();
  });

  it('offers no marker on the rows inside it', async () => {
    const { pairings, settle, el } = await render(async () => [LID]);

    pairings.show('takeaway-cup-300', 1);
    await settle();

    // The counterpart of a lid is the cup that opened this panel, and a modal
    // has no way back.
    expect(el.querySelector('app-product-pairings')).toBeNull();
  });

  it('asks again when a different product opens it', async () => {
    const { pairings, settle, asked } = await render(async () => [LID]);

    pairings.show('takeaway-cup-300', 1);
    await settle();
    pairings.close();
    await settle();
    pairings.show('takeaway-lid-flat', 1);
    await settle();

    // Keyed on the slug: one product's counterparts must never be shown under
    // another's marker.
    expect(asked).toEqual(['takeaway-cup-300', 'takeaway-lid-flat']);
  });

  it('says so when the counterparts cannot be fetched', async () => {
    const { pairings, settle, el } = await render(async () => {
      throw new Error('offline');
    });

    pairings.show('takeaway-cup-300', 1);
    await settle();

    expect(el.textContent).toContain(text.loadError);
  });

  it('closes on the panel’s own answer', async () => {
    const { pairings, settle, el } = await render(async () => [LID]);

    pairings.show('takeaway-cup-300', 1);
    await settle();

    const close = [...el.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(text.close),
    );
    close?.click();
    await settle();

    expect(pairings.open()).toBeNull();
    expect(el.querySelector('dialog')).toBeNull();
  });
});
