import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { DeploymentConfig } from '../config/deployment-config.type';
import { packagedPackaging } from '../catalog/product.fixture';
import { CartAddition, CartService } from '../cart/cart.service';
import { CheckoutDraftService } from './checkout-draft.service';
import { CheckoutPage } from './checkout-page';

const text = defaultAppText.checkout;

function addition(): CartAddition {
  return {
    slug: 'filter-roast',
    name: 'Filter Roast',
    unit: 'pack',
    pieces: 12,
    note: null,
    image: null,
    lineNoteEnabled: false,
    lineNotePrompt: null,
    prices: {
      pieceMilliMinor: 1_166_667,
      pieceLotMinor: 7000,
      pack: 7000,
      box: 28_000,
    },
    packaging: { ...packagedPackaging },
  };
}

/** The page, with whatever offices the deployment is said to have. */
function render(config: DeploymentConfig = defaultDeploymentConfig) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
    ],
  });
  return TestBed.createComponent(CheckoutPage);
}

/** The deployment's collection points, trimmed to the first `count` — none at
 * all leaves the key absent, which is how a shop says it offers no pickup. */
function withPickupPoints(count: number): DeploymentConfig {
  const locations = (defaultDeploymentConfig.pickup?.locations ?? []).slice(
    0,
    count,
  );
  return {
    ...defaultDeploymentConfig,
    pickup: locations.length ? { locations } : undefined,
  };
}

function textOf(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent ?? '';
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('has nothing to order with an empty cart', () => {
    const fixture = render();
    fixture.detectChanges();

    expect(textOf(fixture)).toContain(text.emptyCart);
    expect(textOf(fixture)).not.toContain(text.fulfilment.heading);
  });

  it('offers both fulfilments, and asks for an office only once pickup is chosen', () => {
    const fixture = render();
    TestBed.inject(CartService).add(addition());
    fixture.detectChanges();

    expect(textOf(fixture)).toContain(text.fulfilment.deliveryTitle);
    expect(textOf(fixture)).toContain(text.fulfilment.pickupTitle);
    expect(textOf(fixture)).not.toContain(text.fulfilment.pickupHeading);

    TestBed.inject(CheckoutDraftService).patch({ fulfilmentMethod: 'pickup' });
    fixture.detectChanges();

    expect(textOf(fixture)).toContain(text.fulfilment.pickupHeading);
    for (const point of defaultDeploymentConfig.pickup?.locations ?? []) {
      expect(textOf(fixture)).toContain(point.name);
      expect(textOf(fixture)).toContain(point.address);
    }
  });

  it('offers no pickup at all where the deployment has no collection points', () => {
    const fixture = render(withPickupPoints(0));
    TestBed.inject(CartService).add(addition());
    fixture.detectChanges();

    expect(textOf(fixture)).toContain(text.fulfilment.deliveryTitle);
    expect(textOf(fixture)).not.toContain(text.fulfilment.pickupTitle);
  });

  it('picks the only collection point, and asks where there are two', () => {
    const single = render(withPickupPoints(1));
    TestBed.inject(CartService).add(addition());
    single.detectChanges();
    single.componentInstance['chooseFulfilment']('pickup');

    expect(TestBed.inject(CheckoutDraftService).draft().pickupLocationKey).toBe(
      withPickupPoints(1).pickup?.locations[0].key,
    );

    TestBed.resetTestingModule();
    sessionStorage.clear();

    const several = render(withPickupPoints(2));
    TestBed.inject(CartService).add(addition());
    several.detectChanges();
    several.componentInstance['chooseFulfilment']('pickup');

    expect(
      TestBed.inject(CheckoutDraftService).draft().pickupLocationKey,
    ).toBeNull();
  });
});
