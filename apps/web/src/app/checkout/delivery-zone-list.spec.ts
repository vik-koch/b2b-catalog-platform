import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { DeliveryZoneList } from './delivery-zone-list';

type Zones = NonNullable<DeploymentConfig['delivery']>['zones'];

function render(zones: Zones, spread = false): HTMLElement {
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
  fixture.componentRef.setInput('spread', spread);
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

  it('sets the words a description marks in bold, and nothing else', () => {
    const el = render([
      {
        key: 'city',
        title: 'City',
        description: 'Within <b>two days</b>, <i>always</i>.',
        match: { all: true },
      },
    ]);

    expect(el.querySelector('b')?.textContent).toBe('two days');
    expect(el.querySelector('i')).toBeNull();
    expect(el.textContent).toContain('Within two days, <i>always</i>.');
  });

  it('puts neighbours of one level side by side when spread', () => {
    const zone = (key: string, level?: number) => ({
      key,
      title: key,
      level,
      match: { postalPrefixes: ['1'] },
    });
    const zones = [
      zone('city', 0),
      zone('east', 1),
      zone('west', 1),
      zone('rest'),
    ];

    const spans = (el: HTMLElement) =>
      [...el.querySelectorAll('li')].map(
        (li) =>
          [...li.classList].find((c) => c.startsWith('sm:col-span-')) ?? '',
      );

    expect(spans(render(zones, true))).toEqual([
      'sm:col-span-12',
      'sm:col-span-6',
      'sm:col-span-6',
      'sm:col-span-12',
    ]);
  });

  it('keeps the plain list where it is not spread', () => {
    TestBed.resetTestingModule();
    const el = render([
      { key: 'a', title: 'A', level: 1, match: { postalPrefixes: ['1'] } },
      { key: 'b', title: 'B', level: 1, match: { all: true } },
    ]);

    expect(el.querySelector('[class*="col-span"]')).toBeNull();
    expect(el.querySelector('app-icon')).toBeNull();
  });
});
