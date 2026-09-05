import { TestBed } from '@angular/core/testing';
import {
  AdminCategory,
  AdminProductListItem,
  DocumentProduct,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { AdminCatalogService } from '../admin-catalog.service';
import { DocumentProductsPicker } from './document-products-picker';

const text = defaultAdminText.documentEditor.products;

const listItem = (
  overrides: Partial<AdminProductListItem> & { slug: string; name: string },
): AdminProductListItem => ({
  priceMinor: 500,
  categoryId: 'cat-1',
  sourceId: 'manual:x',
  thumb: null,
  availability: null,
  stockPieces: null,
  deletedAt: null,
  publishedAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const category: AdminCategory = {
  id: 'cat-1',
  slug: 'espresso',
  name: 'Espresso Roasts',
  parentId: null,
  sortOrder: 0,
  image: null,
  sourceId: 'espresso',
  description: null,
  shortName: null,
  productCount: 3,
  childCount: 0,
};

/** Four rows, so a shift-click has a run to cover. */
const catalog = [
  listItem({ slug: 'one', name: 'Alpha' }),
  listItem({ slug: 'two', name: 'Bravo' }),
  listItem({ slug: 'three', name: 'Charlie' }),
  listItem({ slug: 'four', name: 'Delta' }),
];

async function render(
  options: {
    value?: DocumentProduct[];
    items?: AdminProductListItem[];
    total?: number;
  } = {},
) {
  const items = options.items ?? catalog;
  const listProducts = vi.fn(async () => ({
    items,
    pagination: {
      page: 1,
      pageSize: 50,
      total: options.total ?? items.length,
      totalPages: 1,
    },
  }));
  const listCategories = vi.fn(async () => [category]);

  TestBed.configureTestingModule({
    imports: [DocumentProductsPicker],
    providers: [
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      {
        provide: AdminCatalogService,
        useValue: { listProducts, listCategories },
      },
    ],
  });

  const fixture = TestBed.createComponent(DocumentProductsPicker);
  fixture.componentRef.setInput('value', options.value ?? []);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const emitted: DocumentProduct[][] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const boxes = () => [
    ...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  /** Clicks a row's tick, optionally with shift held. */
  const tick = async (index: number, shiftKey = false) => {
    boxes()[index].dispatchEvent(
      new MouseEvent('click', { shiftKey, bubbles: true, cancelable: true }),
    );
    await settle();
  };
  /** Feeds the emitted value back in, as the editor's signal does. */
  const apply = async (value: DocumentProduct[]) => {
    fixture.componentRef.setInput('value', value);
    await settle();
  };
  const rowNames = () =>
    [...el.querySelectorAll('li label span:first-of-type')].map((s) =>
      s.textContent?.trim(),
    );
  const clickButton = async (label: string) => {
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes(label))
      ?.click();
    await settle();
  };

  return {
    fixture,
    el,
    emitted,
    listProducts,
    tick,
    apply,
    rowNames,
    clickButton,
    settle,
  };
}

describe('DocumentProductsPicker (FR-DOC-02)', () => {
  it('lists the catalog with a tick per product', async () => {
    const { rowNames } = await render();
    expect(rowNames()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('links one product on a plain click', async () => {
    const { tick, emitted } = await render();

    await tick(1);

    expect(emitted.at(-1)).toEqual([
      { slug: 'two', name: 'Bravo', deleted: false, unpublished: false },
    ]);
  });

  it('links a whole run when shift is held', async () => {
    const { tick, apply, emitted } = await render();

    await tick(0);
    await apply(emitted.at(-1) as DocumentProduct[]);
    await tick(2, true);

    // Name order — Alpha, Bravo, Charlie — which is the order a save writes.
    expect(emitted.at(-1)?.map((p) => p.slug)).toEqual(['one', 'two', 'three']);
  });

  it('unlinks a run the same way, from the row that was clicked', async () => {
    const linked = catalog.map((item) => ({
      slug: item.slug,
      name: item.name,
      deleted: false,
      unpublished: false,
    }));
    const { tick, apply, emitted } = await render({ value: linked });

    await tick(3);
    await apply(emitted.at(-1) as DocumentProduct[]);
    await tick(1, true);

    expect(emitted.at(-1)?.map((p) => p.slug)).toEqual(['one']);
  });

  it('shows only what is linked in the linked view, from the value itself', async () => {
    const { clickButton, rowNames } = await render({
      // A product the catalog query would never return: deleted.
      value: [
        { slug: 'gone', name: 'Zulu', deleted: true, unpublished: false },
      ],
    });

    await clickButton('Linked');

    expect(rowNames()).toEqual(['Zulu']);
  });

  it('says the linked view is empty rather than showing an empty catalog', async () => {
    const { clickButton, el } = await render();
    await clickButton('Linked');
    expect(el.textContent).toContain(text.noneLinked);
  });

  it('says how much of the catalog the page is not showing', async () => {
    const { el } = await render({ total: 137 });
    expect(el.textContent).toContain('137');
  });

  it('leaves a deleted product out of the catalog view', async () => {
    const { rowNames } = await render({
      items: [
        ...catalog,
        listItem({
          slug: 'dead',
          name: 'Echo',
          deletedAt: '2026-01-01T00:00:00.000Z',
        }),
      ],
    });
    expect(rowNames()).not.toContain('Echo');
  });
});
