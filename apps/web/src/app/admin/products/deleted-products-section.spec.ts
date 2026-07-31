import { TestBed } from '@angular/core/testing';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import { AdminCatalogService } from '../admin-catalog.service';
import { DeletedProductsSection } from './deleted-products-section';

const text = defaultAdminText.editMode;

const deletedItem: ProductListItem = {
  slug: 'old-roast',
  name: 'Old Roast',
  priceMinor: 990,
  images: [{ full: 'f.jpg', thumb: 't.jpg' }],
};

const config = {
  catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
} as unknown as DeploymentConfig;

async function render(
  items: ProductListItem[],
  restoreProduct = vi.fn().mockResolvedValue({}),
) {
  const listDeletedProducts = vi.fn().mockResolvedValue(items);
  TestBed.configureTestingModule({
    imports: [DeletedProductsSection],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      {
        provide: AdminCatalogService,
        useValue: { listDeletedProducts, restoreProduct },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeletedProductsSection);
  fixture.componentRef.setInput('categorySlug', 'espresso');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, restoreProduct };
}

describe('DeletedProductsSection', () => {
  it('renders nothing when there are no deleted products', async () => {
    const { el } = await render([]);

    expect(el.querySelector('section')).toBeNull();
    expect(el.textContent).not.toContain(text.deletedHeading);
  });

  it('lists the deleted products under a "Deleted" heading', async () => {
    const { el } = await render([deletedItem]);

    expect(el.textContent).toContain(text.deletedHeading);
    expect(el.textContent).toContain('Old Roast');
  });

  it('emits loaded once the deleted set has resolved, even when empty', async () => {
    const listDeletedProducts = vi.fn().mockResolvedValue([]);
    TestBed.configureTestingModule({
      imports: [DeletedProductsSection],
      providers: [
        { provide: APP_TEXT, useValue: defaultAppText },
        { provide: ADMIN_TEXT, useValue: defaultAdminText },
        { provide: DEPLOYMENT_CONFIG, useValue: config },
        {
          provide: AdminCatalogService,
          useValue: { listDeletedProducts, restoreProduct: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(DeletedProductsSection);
    const loaded = vi.fn();
    fixture.componentInstance.loaded.subscribe(loaded);
    fixture.componentRef.setInput('categorySlug', 'espresso');
    await fixture.whenStable();

    expect(loaded).toHaveBeenCalled();
  });

  it('restores a product and emits restored', async () => {
    const restoreProduct = vi.fn().mockResolvedValue({});
    const { fixture, el } = await render([deletedItem], restoreProduct);
    const restored = vi.fn();
    fixture.componentInstance.restored.subscribe(restored);

    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(defaultAdminText.common.restore),
    );
    button?.click();
    await fixture.whenStable();

    expect(restoreProduct).toHaveBeenCalledWith('old-roast');
    expect(restored).toHaveBeenCalled();
  });
});
