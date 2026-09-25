import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { productListItem } from '../catalog/product.fixture';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { FeaturedRow } from './featured-row';
import { FeaturedRowService } from './featured-row.service';

const text = defaultAppText.home.featured;

async function render(row: () => Promise<ProductListItem[] | undefined>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FeaturedRow],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: FeaturedRowService, useValue: { row } },
    ],
  });
  const fixture = TestBed.createComponent(FeaturedRow);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const items = [
  productListItem({ slug: 'hafen-espresso', name: 'Hafen Espresso' }),
  productListItem({ slug: 'filter-blend', name: 'Filter Blend' }),
  productListItem({ slug: 'takeaway-cup', name: 'Takeaway Cup' }),
];

describe('FeaturedRow', () => {
  it('draws the row as listing cards under its heading', async () => {
    const el = await render(async () => items);

    expect(el.querySelector('h2')?.textContent).toContain(text.heading);
    const tiles = el.querySelectorAll('app-product-tile');
    expect(tiles).toHaveLength(3);
    expect(tiles[0].textContent).toContain('Hafen Espresso');
    expect(el.querySelector('a[href="/product/filter-blend"]')).not.toBeNull();
  });

  it('keeps the order it was handed — the draw is the server’s', async () => {
    const el = await render(async () => items);

    const names = [...el.querySelectorAll('app-product-tile h2')].map((h) =>
      h.textContent?.trim(),
    );
    expect(names).toEqual(['Hafen Espresso', 'Filter Blend', 'Takeaway Cup']);
  });

  it('draws the small card: a thumbnail with the badges beside it', async () => {
    const el = await render(async () => items);

    const tile = el.querySelector('app-product-tile')!;
    expect(tile.querySelector('.size-24 app-tile-gallery')).not.toBeNull();
    expect(
      tile.querySelector('app-product-status-line')?.className.split(' '),
    ).toContain('flex-col');
  });

  it('is absent, not empty, where there is nothing to show', async () => {
    const el = await render(async () => []);

    expect(el.querySelector('section')).toBeNull();
    expect(el.textContent).not.toContain(text.heading);
  });

  it('is absent where the row could not be loaded', async () => {
    const el = await render(async () => {
      throw new Error('offline');
    });

    expect(el.querySelector('section')).toBeNull();
  });

  it('draws nothing on a render that leaves prices to the browser', async () => {
    const el = await render(async () => undefined);

    expect(el.querySelector('section')).toBeNull();
    expect(el.querySelector('app-product-tile')).toBeNull();
  });
});
