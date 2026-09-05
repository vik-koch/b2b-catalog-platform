import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductDetail } from './product-detail';
import { CatalogService } from './catalog.service';
import { productDetail } from './product.fixture';

type Product = NonNullable<Awaited<ReturnType<CatalogService['getProduct']>>>;

const product: Product = productDetail({
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
    { key: 'Net weight', value: '1', unit: 'kg', filterSlug: 'net-weight' },
    { key: 'Count per package', value: '200', unit: null, filterSlug: null },
  ],
  category: {
    slug: 'espresso',
    name: 'Espresso Roasts',
    shortName: null,
    ancestors: [{ slug: 'coffee', name: 'Coffee', shortName: null }],
  },
});

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

  it('walks the whole category path in the breadcrumb, nicknames included', async () => {
    const root = el(
      await render({
        ...product,
        category: {
          slug: 'espresso',
          name: 'Espresso Roasts',
          shortName: 'Roasts',
          ancestors: [
            { slug: 'coffee', name: 'Coffee', shortName: null },
            { slug: 'beans', name: 'Coffee Beans', shortName: 'Beans' },
          ],
        },
      }),
    );

    const crumbs = [...root.querySelectorAll('nav ol li')]
      .map((n) => n.textContent?.trim())
      .filter((text) => text);
    expect(crumbs).toEqual([
      defaultAppText.catalog.catalogRoot,
      'Coffee',
      'Beans',
      'Roasts',
      'Hafen Espresso',
    ]);
    expect(root.querySelector('a[href="/catalog/beans"]')).toBeTruthy();
  });

  // FR-DOC-03. The section is drawn from what the API sent: an expired
  // document is dropped there, so the page has no state of its own to get
  // wrong — only the question of whether there is anything to list.
  it('lists the documents on the product, each opening its file', async () => {
    const root = el(
      await render({
        ...product,
        documents: [
          {
            title: 'Certificate of analysis',
            url: '/documents/aaaaaaaaaaaa.pdf',
            contentType: 'application/pdf',
            byteSize: 2048,
          },
        ],
      }),
    );

    expect(root.textContent).toContain(defaultAppText.catalog.documents.label);
    expect(
      root.querySelector('a[href="/documents/aaaaaaaaaaaa.pdf"]')?.textContent,
    ).toContain('Certificate of analysis');
  });

  it('heads no document section when there is nothing current to show', async () => {
    const root = el(await render({ ...product, documents: [] }));

    expect(root.textContent).not.toContain(
      defaultAppText.catalog.documents.label,
    );
  });

  it('renders the attributes as a specifications table', async () => {
    const root = el(await render(product));

    // A real table (th/td) so a cell selection copies as TSV — see
    // product-detail-view.
    // Scoped to the section: the same facts also head the band beside the
    // photo, where only the first few of them stand.
    const table = root.querySelector('#specifications');
    const keys = [...(table?.querySelectorAll('tbody th') ?? [])].map((n) =>
      n.textContent?.trim(),
    );
    const values = [...(table?.querySelectorAll('tbody td') ?? [])].map((n) =>
      n.textContent?.trim(),
    );
    expect(keys).toEqual(['Net weight', 'Count per package']);
    expect(values).toEqual(['1 kg', '200']);
  });

  it('links a filterable value into its own category, filtered (FR-ATTR-08)', async () => {
    const root = el(await render(product));
    const href = `/catalog/${product.category.slug}?attr=net-weight:1`;

    // Twice, and that is the point: the band beside the photo repeats the
    // first few of these rows, and both tables draw the cell from one
    // template — the band's used to be a copy that printed plain text, so the
    // same value was a link a screen further down and not here.
    const links = [...root.querySelectorAll('tbody td a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([href, href]);

    // Scoped to the section, the link is the one row that has one: the link is
    // written from the *stored* value — "1", not the "1 kg" the row shows —
    // because that is what the facet and the URL are keyed by.
    const inSection = [
      ...(root.querySelectorAll('#specifications tbody td a') ?? []),
    ];
    expect(inSection.map((a) => a.getAttribute('href'))).toEqual([href]);
    // And an undeclared attribute stays plain text: the underline is the only
    // cue that the shop filters by an attribute at all.
    expect(links[0].textContent?.trim()).toBe('1 kg');
  });

  it('leaves out an attribute with no value', async () => {
    // Stored before valueless attributes stopped being saved: a row here would
    // print a label with nothing beside it.
    const root = el(
      await render({
        ...product,
        attributes: [
          ...product.attributes,
          { key: 'Roast', value: '', unit: null, filterSlug: null },
        ],
      }),
    );

    const keys = [...root.querySelectorAll('#specifications tbody th')].map(
      (n) => n.textContent?.trim(),
    );
    expect(keys).toEqual(['Net weight', 'Count per package']);
  });

  // The band beside the photo is the head of that table, not a second one: the
  // first few facts, and a link to the rest of them.
  it('heads the page with the first few facts and a way to the rest', async () => {
    const root = el(await render(product));
    const band = root.querySelector('table:not(#specifications table)');

    expect(
      [...(band?.querySelectorAll('tbody th') ?? [])].map((n) =>
        n.textContent?.trim(),
      ),
    ).toEqual(['Net weight', 'Count per package']);
    expect(root.textContent).toContain(
      defaultAppText.catalog.allSpecifications,
    );
  });

  it('shows a not-found message when the product does not exist', async () => {
    const root = el(await render(null));

    expect(root.textContent).toContain(defaultAppText.catalog.productNotFound);
  });
});
