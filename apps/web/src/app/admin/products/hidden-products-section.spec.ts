import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HiddenProduct } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminCatalogService } from '../admin-catalog.service';
import { productListItem } from '../../catalog/product.fixture';
import { HiddenProductsSection } from './hidden-products-section';

const text = defaultAdminText.editMode;

const hidden = (overrides: Partial<HiddenProduct> = {}): HiddenProduct => ({
  ...productListItem({
    slug: 'old-roast',
    name: 'Old Roast',
    priceMinor: 990,
    images: [{ full: 'f.jpg', thumb: 't.jpg', variant: null }],
  }),
  ...overrides,
});

const config = {
  catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
} as unknown as DeploymentConfig;

const tell = vi.fn(async () => undefined);

function provide(admin: Partial<AdminCatalogService>) {
  tell.mockClear();
  TestBed.configureTestingModule({
    imports: [HiddenProductsSection],
    providers: [
      // The tile's edit link is a router link back to the admin editor.
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: AdminCatalogService, useValue: admin },
      { provide: ConfirmService, useValue: { tell } },
    ],
  });
  return TestBed.createComponent(HiddenProductsSection);
}

async function render(items: HiddenProduct[]) {
  const setProductPublished = vi.fn().mockResolvedValue({});
  const fixture = provide({
    listHiddenProducts: vi.fn().mockResolvedValue(items),
    setProductPublished,
  } as unknown as Partial<AdminCatalogService>);
  fixture.componentRef.setInput('categorySlug', 'espresso');
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
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

  it('lists what the storefront hides, badged unpublished', async () => {
    const { el } = await render([hidden()]);

    expect(el.textContent).toContain(text.hiddenHeading);
    expect(el.textContent).toContain('Old Roast');
    expect(el.textContent).toContain(text.unpublishedBadge);
    expect(el.textContent).not.toContain(text.unpricedBadge);
    expect(el.textContent).not.toContain(text.deletedBadge);
  });

  it('shows both reasons on a product that is unpublished and unpriced', async () => {
    const { el } = await render([hidden({ priceMinor: null })]);

    expect(el.textContent).toContain(text.unpublishedBadge);
    expect(el.textContent).toContain(text.unpricedBadge);
  });

  it('publishes a product and emits published', async () => {
    const { fixture, el, setProductPublished } = await render([hidden()]);
    const published = vi.fn();
    fixture.componentInstance.published.subscribe(published);

    actionButton(el, text.publishProduct)?.click();
    await fixture.whenStable();

    expect(setProductPublished).toHaveBeenCalledWith('old-roast', true);
    expect(published).toHaveBeenCalled();
  });

  it('offers the editor on every tile, returning to this page', async () => {
    const { el } = await render([hidden()]);

    // A tile down here carries no pencil of its own, and an unpriced product
    // is fixed in the editor rather than by the button under it.
    const link = el.querySelector<HTMLAnchorElement>('a[href*="/edit"]');
    expect(link?.getAttribute('href')).toContain(
      '/admin/products/old-roast/edit',
    );
    expect(link?.getAttribute('href')).toContain('from=');
  });

  it('explains rather than acting on a product nothing prices', async () => {
    const { fixture, el, setProductPublished } = await render([
      hidden({ priceMinor: null }),
    ]);

    actionButton(el, text.publishProduct)?.click();
    await fixture.whenStable();

    // The server would refuse it, so the click is answered with the reason
    // instead of a request — and the button is live enough to give it.
    expect(setProductPublished).not.toHaveBeenCalled();
    expect(tell).toHaveBeenCalledWith(
      expect.objectContaining({ heading: text.unpricedTitle }),
    );
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
