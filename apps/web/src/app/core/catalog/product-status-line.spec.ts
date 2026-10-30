import { SHARED_TEXT } from '../../shared/config/shared-text';
import { defaultSharedText } from '../../shared/config/shared-text.fixture';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductAvailability } from '@b2b-catalog-platform/shared/core/catalog';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { defaultStorefrontText } from '../../shared/config/storefront-text.fixture';
import { ProductSetBadge } from './product-set-badge';
import { anyStatus, ProductStatusLine } from './product-status-line';

const text = defaultStorefrontText.catalog;

@Component({
  imports: [ProductStatusLine, ProductSetBadge],
  template: `
    <app-product-status-line
      [availability]="availability()"
      [parts]="parts()"
      [reserve]="reserve()"
    />
    <app-product-set-badge
      class="full"
      variant="full"
      [parts]="['cup', 'lid']"
    />
  `,
})
class Host {
  readonly availability = signal<ProductAvailability | null>(null);
  readonly parts = signal<string[]>([]);
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

function line(fixture: { nativeElement: unknown }): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    'app-product-status-line',
  ) as HTMLElement;
}

describe('ProductStatusLine', () => {
  it('puts the set badge beside the stock badge, wrapping rather than cutting', async () => {
    const fixture = await render();
    fixture.componentInstance.availability.set('low');
    fixture.componentInstance.parts.set(['cup', 'lid']);
    fixture.detectChanges();

    const el = line(fixture);
    expect(el.textContent).toContain(
      defaultSharedText.product.availability.low,
    );
    expect(el.textContent).toContain(text.set.short);
    expect(el.className).toContain('flex-wrap');
  });

  it('names the parts to a pointer and to a screen reader', async () => {
    const fixture = await render();
    fixture.componentInstance.parts.set(['cup', 'lid']);
    fixture.detectChanges();

    const full = text.set.full.replace('{parts}', 'cup + lid');
    const badge = line(fixture).querySelector('app-product-set-badge span');
    expect(badge?.getAttribute('title')).toBe(full);
    expect(line(fixture).querySelector('.sr-only')?.textContent).toBe(full);
  });

  it('is absent for a plain, untracked product in a listing that reserves nothing', async () => {
    const fixture = await render();
    expect(line(fixture).style.display).toBe('none');
  });

  it('holds the line open with the stock spacer where only the listing asks', async () => {
    const fixture = await render();
    fixture.componentInstance.reserve.set(true);
    fixture.detectChanges();

    const el = line(fixture);
    expect(el.style.display).toBe('');
    expect(el.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(el.querySelector('app-product-set-badge')).toBeNull();
  });

  it('draws no set badge for a single part', async () => {
    const fixture = await render();
    fixture.componentInstance.parts.set(['cup']);
    fixture.detectChanges();
    expect(line(fixture).querySelector('app-product-set-badge')).toBeNull();
  });
});

describe('ProductSetBadge, full', () => {
  it('says the whole sentence in the badge itself', async () => {
    const fixture = await render();
    const full = (fixture.nativeElement as HTMLElement).querySelector('.full');
    expect(full?.textContent?.trim()).toBe(
      text.set.full.replace('{parts}', 'cup + lid'),
    );
  });
});

describe('anyStatus', () => {
  it('is true as soon as one product in the listing states a stock', () => {
    expect(anyStatus([{ availability: null }, { availability: 'out' }])).toBe(
      true,
    );
  });

  it('is true as soon as one product is a set', () => {
    expect(
      anyStatus([
        { availability: null, parts: [] },
        { availability: null, parts: ['cup', 'lid'] },
      ]),
    ).toBe(true);
  });

  it('is false where the whole page is untracked and nothing is a set', () => {
    // What keeps a catalog that tracks nothing from growing a blank line above
    // every name.
    expect(
      anyStatus([{ availability: null, parts: [] }, { availability: null }]),
    ).toBe(false);
  });
});
