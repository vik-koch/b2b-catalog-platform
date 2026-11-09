import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import {
  HiddenReasons,
  ProductPage,
} from '@b2b-catalog-platform/shared/core/catalog';
import type { DeploymentConfigFile } from '@b2b-catalog-platform/shared/deployment';

import { provideFakeProductCart } from '../../../core/catalog/buying/product-cart.fixture';
import { defaultSharedCatalogText } from '../../../core/catalog/catalog-text.fixture';
import { EDIT_MODE_CATALOG } from '../../../core/catalog/edit-mode-catalog';
import {
  plainPrices,
  productDetail,
} from '../../../core/catalog/product.fixture';
import { AuthService } from '../../../platform/auth/auth.service';
import { loadAdminText } from '../../../platform/config/admin-text';
import { defaultAdminText } from '../../../platform/config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../../platform/config/deployment-config.fixture';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { defaultSharedText } from '../../../platform/config/shared-text.fixture';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { defaultStorefrontText } from '../../../platform/config/storefront-text.fixture';
import { defaultStorefrontCatalogText } from '../catalog-text.fixture';
import { CatalogService } from '../catalog.service';
import { ProductDetail } from './product-detail';

type Product = NonNullable<Awaited<ReturnType<CatalogService['getProduct']>>>;

const product: Product = productDetail({
  slug: 'hafen-espresso',
  name: 'Hafen Espresso',
  prices: plainPrices(1890),
  descriptionHtml: '<p>Dark and <strong>syrupy</strong>.</p>',
  images: [
    {
      full: 'https://img.example/full/1.jpg',
      thumb: 'https://img.example/thumb/1.jpg',
      variant: null,
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
  admin?: { getPage: () => Promise<ProductPage | null> },
): Promise<ComponentFixture<ProductDetail>> {
  const config = {
    locale: 'de-DE',
    branding: { name: 'Test Shop', tagline: 'Test tagline' },
    currency: { code: 'EUR' },
    catalog: defaultDeploymentConfig.catalog,
  } as unknown as DeploymentConfigFile;
  TestBed.configureTestingModule({
    imports: [ProductDetail],
    providers: [
      provideFakeProductCart(),
      provideRouter([]),
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: CatalogService, useValue: { getProduct: async () => result } },
      // An admin session where the test names an admin read, a guest's
      // otherwise.
      {
        provide: AuthService,
        useValue: {
          user: signal(admin ? { role: 'admin' } : null),
          resolved: signal(true),
          hintedRole: signal(admin ? 'admin' : null),
          whenResolved: async () => undefined,
        },
      },
      { provide: EDIT_MODE_CATALOG, useValue: async () => admin },
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
      defaultSharedCatalogText.catalogRoot,
      'Coffee',
      'Beans',
      'Roasts',
      'Hafen Espresso',
    ]);
    expect(root.querySelector('a[href="/catalog/beans"]')).toBeTruthy();
  });

  // FR-DOC-03. Drawn from what the API sent, which drops expired documents:
  // the page only asks whether there is anything to list.
  it('lists the documents on the product, each opening its file', async () => {
    const root = el(
      await render({
        ...product,
        documents: [
          {
            title: 'Certificate of analysis',
            file: {
              url: '/documents/aaaaaaaaaaaa.pdf',
              contentType: 'application/pdf',
              byteSize: 2048,
            },
            link: null,
          },
        ],
      }),
    );

    expect(root.textContent).toContain(
      defaultSharedCatalogText.product.documents,
    );
    expect(
      root.querySelector('a[href="/documents/aaaaaaaaaaaa.pdf"]')?.textContent,
    ).toContain('Certificate of analysis');
  });

  it('heads no document section when there is nothing current to show', async () => {
    const root = el(await render({ ...product, documents: [] }));

    expect(root.textContent).not.toContain(
      defaultSharedCatalogText.product.documents,
    );
  });

  it('renders the attributes as a specifications table', async () => {
    const root = el(await render(product));

    // A real table (th/td), so a selection copies as TSV
    // (product-detail-view).
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

    // Twice: the band beside the photo repeats the first rows, and both draw
    // the cell from one template, so a value is a link in both.
    const links = [...root.querySelectorAll('tbody td a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([href, href]);

    // The one row with a link, written from the stored value ("1", not the
    // shown "1 kg"), which facet and URL are keyed by.
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
      defaultSharedCatalogText.allSpecifications,
    );
  });

  it('shows a not-found message when the product does not exist', async () => {
    const root = el(await render(null));

    expect(root.textContent).toContain(
      defaultStorefrontCatalogText.listing.productNotFound,
    );
  });

  describe('a product the public cannot see (FR-ADM-06)', () => {
    const hidden: HiddenReasons = {
      deleted: false,
      deletedByRun: false,
      unpublished: true,
      unpriced: false,
      ordered: false,
    };

    it('shows an admin the page, kept out of the index', async () => {
      const getPage = vi.fn(async () => ({ product, hidden }));
      const fixture = await render(null, { getPage });

      expect(getPage).toHaveBeenCalled();
      expect(el(fixture).textContent).toContain('Hafen Espresso');
      expect(el(fixture).textContent).not.toContain(
        defaultStorefrontCatalogText.listing.productNotFound,
      );
      expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe(
        'noindex',
      );
    });

    it('says beside the name why it is hidden, drawn with the page', async () => {
      vi.stubGlobal('fetch', () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(defaultAdminText),
        }),
      );
      try {
        await loadAdminText();
        const fixture = await render(null, {
          getPage: async () => ({
            product,
            hidden: { ...hidden, unpriced: true },
          }),
        });

        const heading = el(fixture).querySelector('h1')?.parentElement;
        expect(heading?.textContent).toContain(
          defaultAdminText.editMode.unpublishedBadge,
        );
        expect(heading?.textContent).toContain(
          defaultAdminText.editMode.unpricedBadge,
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('answers an admin not-found where there is no such product at all', async () => {
      const fixture = await render(null, {
        getPage: async () => null,
      });

      expect(el(fixture).textContent).toContain(
        defaultStorefrontCatalogText.listing.productNotFound,
      );
    });

    it('never asks the admin read for a live product', async () => {
      const getPage = vi.fn(async () => null);
      await render(product, { getPage });

      expect(getPage).not.toHaveBeenCalled();
      expect(TestBed.inject(Meta).getTag('name="robots"')).toBeNull();
    });
  });
});
