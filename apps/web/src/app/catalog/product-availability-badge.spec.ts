import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductAvailability } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import {
  anyAvailability,
  ProductAvailabilityBadge,
} from './product-availability-badge';

const text = defaultAppText.catalog.availability;

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
    providers: [{ provide: APP_TEXT, useValue: defaultAppText }],
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

describe('anyAvailability', () => {
  it('is true as soon as one product in the listing states a stock', () => {
    expect(
      anyAvailability([{ availability: null }, { availability: 'out' }]),
    ).toBe(true);
  });

  it('is false where the whole page is untracked', () => {
    // What keeps a catalog that tracks nothing from growing a blank line above
    // every name.
    expect(
      anyAvailability([{ availability: null }, { availability: null }]),
    ).toBe(false);
  });
});
