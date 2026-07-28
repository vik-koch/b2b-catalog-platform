import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductDetail } from './product-detail';
import { CatalogService } from './catalog.service';

type Product = NonNullable<Awaited<ReturnType<CatalogService['getProduct']>>>;

const product: Product = {
  slug: 'hafen-espresso',
  name: 'Hafen Espresso',
  priceMinor: 1890,
  descriptionHtml: '<p>Dark and <strong>syrupy</strong>.</p>',
  images: [
    {
      full: 'https://img.example/full/1.jpg',
      thumb: 'https://img.example/thumb/1.jpg',
    },
  ],
  attributes: [
    { key: 'Net weight', value: '1 kg' },
    { key: 'Count per package', value: '200' },
  ],
  category: { slug: 'espresso', name: 'Espresso Roasts' },
};

async function render(
  result: Product | null,
): Promise<ComponentFixture<ProductDetail>> {
  const config = {
    branding: { title: 'Test Shop' },
    catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
  } as unknown as DeploymentConfig;
  TestBed.configureTestingModule({
    imports: [ProductDetail],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: CatalogService, useValue: { getProduct: async () => result } },
    ],
  });
  const fixture = TestBed.createComponent(ProductDetail);
  fixture.componentRef.setInput('slug', 'hafen-espresso');
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<ProductDetail>) =>
  f.nativeElement as HTMLElement;

describe('ProductDetail', () => {
  it('renders name, price, description and a breadcrumb into the category', async () => {
    const f = await render(product);
    const root = el(f);

    expect(root.querySelector('h1')?.textContent).toContain('Hafen Espresso');
    expect(root.textContent?.replace(/\u00A0/g, ' ')).toContain('18,90 €');
    expect(root.querySelector('.prose')?.innerHTML).toContain(
      '<strong>syrupy</strong>',
    );
    expect(
      root.querySelector('a[href="/catalog/espresso"]')?.textContent,
    ).toContain('Espresso Roasts');
  });

  it('renders the attributes as a specifications list', async () => {
    const root = el(await render(product));

    const keys = [...root.querySelectorAll('dt')].map((n) =>
      n.textContent?.trim(),
    );
    const values = [...root.querySelectorAll('dd')].map((n) =>
      n.textContent?.trim(),
    );
    expect(keys).toEqual(['Net weight', 'Count per package']);
    expect(values).toEqual(['1 kg', '200']);
  });

  it('shows a not-found message when the product does not exist', async () => {
    const root = el(await render(null));

    expect(root.textContent).toContain(defaultAppText.catalog.productNotFound);
  });
});
