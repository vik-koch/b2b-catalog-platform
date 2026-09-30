import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { DeliveryZoneList } from './delivery-zone-list';

type Zones = NonNullable<DeploymentConfig['delivery']>['zones'];

function render(zones: Zones): HTMLElement {
  TestBed.configureTestingModule({
    imports: [DeliveryZoneList],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: { ...defaultDeploymentConfig, delivery: { zones } },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryZoneList);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const text = defaultAppText.checkout.fulfilment;

describe('DeliveryZoneList', () => {
  it('states each zone with its terms', () => {
    const el = render([
      {
        key: 'city',
        title: 'City',
        description: 'Our own van.',
        freeFromMinor: 15000,
        match: { all: true },
      },
      { key: 'quoted', title: 'Quoted', match: { all: true } },
      {
        key: 'rest',
        title: 'Rest',
        delivers: false,
        match: { all: true },
      },
    ]);

    const items = [...el.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toContain('Our own van.');
    expect(items[0]).toMatch(/150/);
    expect(items[1]).toContain(text.noFreeDelivery);
    // Not "quoted per order": the zone is not delivered to at all.
    expect(items[2]).toContain(text.noDelivery);
    expect(items[2]).not.toContain(text.noFreeDelivery);
  });
});
