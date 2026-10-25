import { SHARED_TEXT } from '../config/shared-text';
import { defaultSharedText } from '../config/shared-text.fixture';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductAvailability } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../config/storefront-text';
import { defaultStorefrontText } from '../config/storefront-text.fixture';
import { ProductAvailabilityBadge } from './product-availability-badge';

const text = defaultSharedText.product.availability;

@Component({
  imports: [ProductAvailabilityBadge],
  template: `
    <app-product-availability-badge
      [availability]="availability()"
      [reserve]="reserve()"
    />
  `,
})
class Host {
  readonly availability = signal<ProductAvailability | null>(null);
  readonly reserve = signal(false);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('ProductAvailabilityBadge', () => {
  it('names each state in the deployment’s own words', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    for (const [state, label] of [
      ['in', text.in],
      ['low', text.low],
      ['out', text.out],
    ] as const) {
      fixture.componentInstance.availability.set(state);
      fixture.detectChanges();
      expect(host.textContent?.trim()).toBe(label);
    }
  });

  it('shows nothing for a product whose stock is untracked', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    // The default state of the whole feature: a deployment that never enters a
    // figure must look exactly as it did before availability existed.
    expect(host.querySelector('span')).toBeNull();
  });

  it('holds the line open, without a label, once the listing reserves it', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.reserve.set(true);
    fixture.detectChanges();

    const spacer = host.querySelector('span');
    expect(spacer?.getAttribute('aria-hidden')).toBe('true');
    // A blank of the badge's height, so the names on either side sit level —
    // and nothing a screen reader announces.
    expect(spacer?.textContent?.trim()).toBe('');
  });
});
