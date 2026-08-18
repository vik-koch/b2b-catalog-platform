import { TestBed } from '@angular/core/testing';
import { HiddenProduct } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import { AdminCatalogService } from '../admin-catalog.service';
import { productListItem } from '../../catalog/product.fixture';
import { HiddenProductsSection } from './hidden-products-section';

const text = defaultAdminText.editMode;

const hidden = (overrides: Partial<HiddenProduct> = {}): HiddenProduct => ({
  ...productListItem({
    slug: 'old-roast',
    name: 'Old Roast',
    priceMinor: 990,
    images: [{ full: 'f.jpg', thumb: 't.jpg' }],
  }),
  deleted: true,
  unpublished: false,
  ...overrides,
});

const config = {
  catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
} as unknown as DeploymentConfig;

function provide(admin: Partial<AdminCatalogService>) {
  TestBed.configureTestingModule({
    imports: [HiddenProductsSection],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: AdminCatalogService, useValue: admin },
    ],
  });
  return TestBed.createComponent(HiddenProductsSection);
}

async function render(items: HiddenProduct[]) {
  const restoreProduct = vi.fn().mockResolvedValue({});
  const setProductPublished = vi.fn().mockResolvedValue({});
  const fixture = provide({
    listHiddenProducts: vi.fn().mockResolvedValue(items),
    restoreProduct,
    setProductPublished,
  } as unknown as Partial<AdminCatalogService>);
  fixture.componentRef.setInput('categorySlug', 'espresso');
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    restoreProduct,
    setProductPublished,
  };
}

/** The action button, whatever it currently offers to do. */
const actionButton = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(label),
  );

describe('HiddenProductsSection', () => {
  it('renders nothing when the storefront is hiding nothing', async () => {
    const { el } = await render([]);

    expect(el.querySelector('section')).toBeNull();
    expect(el.textContent).not.toContain(text.hiddenHeading);
  });

  it('lists what the storefront hides, and says why', async () => {
    const { el } = await render([hidden()]);

    expect(el.textContent).toContain(text.hiddenHeading);
    expect(el.textContent).toContain('Old Roast');
    expect(el.textContent).toContain(text.deletedBadge);
    expect(el.textContent).not.toContain(text.unpublishedBadge);
  });

  it('badges an unpublished product differently from a deleted one', async () => {
    const { el } = await render([
      hidden({ deleted: false, unpublished: true }),
    ]);

    expect(el.textContent).toContain(text.unpublishedBadge);
    expect(el.textContent).not.toContain(text.deletedBadge);
  });

  it('shows both reasons when both apply, since one action will not be enough', async () => {
    const { el } = await render([hidden({ deleted: true, unpublished: true })]);

    expect(el.textContent).toContain(text.deletedBadge);
    expect(el.textContent).toContain(text.unpublishedBadge);
  });

  it('restores a deleted product and emits restored', async () => {
    const { fixture, el, restoreProduct } = await render([hidden()]);
    const restored = vi.fn();
    fixture.componentInstance.restored.subscribe(restored);

    actionButton(el, defaultAdminText.common.restore)?.click();
    await fixture.whenStable();

    expect(restoreProduct).toHaveBeenCalledWith('old-roast');
    expect(restored).toHaveBeenCalled();
  });

  it('publishes an unpublished one instead', async () => {
    const { fixture, el, setProductPublished } = await render([
      hidden({ deleted: false, unpublished: true }),
    ]);
    const restored = vi.fn();
    fixture.componentInstance.restored.subscribe(restored);

    actionButton(el, text.publishProduct)?.click();
    await fixture.whenStable();

    expect(setProductPublished).toHaveBeenCalledWith('old-roast', true);
    expect(restored).toHaveBeenCalled();
  });

  it('offers restore first for a product that is both — publishing a deleted product shows nobody anything', async () => {
    const { el, setProductPublished, restoreProduct } = await render([
      hidden({ deleted: true, unpublished: true }),
    ]);

    actionButton(el, defaultAdminText.common.restore)?.click();

    expect(restoreProduct).toHaveBeenCalled();
    expect(setProductPublished).not.toHaveBeenCalled();
  });

  it('emits loaded once the set has resolved, even when empty', async () => {
    const fixture = provide({
      listHiddenProducts: vi.fn().mockResolvedValue([]),
    } as unknown as Partial<AdminCatalogService>);
    const loaded = vi.fn();
    fixture.componentInstance.loaded.subscribe(loaded);
    fixture.componentRef.setInput('categorySlug', 'espresso');
    await fixture.whenStable();

    expect(loaded).toHaveBeenCalled();
  });
});
