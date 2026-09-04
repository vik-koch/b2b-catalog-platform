import { TestBed } from '@angular/core/testing';
import {
  AdminProductListItem,
  PairedProduct,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { AdminCatalogService } from '../admin-catalog.service';
import { ProductPairingsEditor } from './product-pairings-editor';

const text = defaultAdminText.productEditor.pairings;

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

/** What the stubbed grid endpoint answers with; set per test. */
let answers: AdminProductListItem[] = [];

async function render(value: PairedProduct[] = [], ownSlug = 'cup') {
  const listProducts = vi.fn(async () => ({
    items: answers,
    pagination: { page: 1, pageSize: 25, total: answers.length, totalPages: 1 },
  }));

  TestBed.configureTestingModule({
    imports: [ProductPairingsEditor],
    providers: [
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: AdminCatalogService, useValue: { listProducts } },
    ],
  });

  const fixture = TestBed.createComponent(ProductPairingsEditor);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('ownSlug', ownSlug);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const emitted: PairedProduct[][] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

  /** Opens the panel if it is not already open — it opens itself where the
   * product has pairings, and clicking the lid then closes it. */
  const open = async () => {
    if (el.querySelector('[role="combobox"]')) return;
    el.querySelector('button')?.dispatchEvent(new Event('click'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return {
    fixture,
    el,
    emitted,
    listProducts,
    open,
    /** Types into the search field, then waits out the debounce. */
    type: async (value: string) => {
      const input = el.querySelector<HTMLInputElement>(
        'input[role="combobox"]',
      );
      if (!input) throw new Error('the search field is not on screen');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 350));
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('ProductPairingsEditor (FR-SET-01)', () => {
  beforeEach(() => {
    answers = [listItem({ slug: 'lid-small', name: 'Small lid' })];
  });

  it('starts closed when nothing is paired', async () => {
    const { el } = await render();

    expect(el.querySelector('[role="combobox"]')).toBeNull();
  });

  it('starts open where there is something to see', async () => {
    const { el } = await render([
      {
        slug: 'lid-small',
        name: 'Small lid',
        deleted: false,
        unpublished: false,
      },
    ]);

    expect(el.textContent).toContain('Small lid');
    expect(el.querySelector('[role="combobox"]')).not.toBeNull();
  });

  it('offers what the search answers, and adds the picked product', async () => {
    const { el, emitted, open, type } = await render();
    await open();

    await type('lid');

    const option = el.querySelector('[role="option"]');
    expect(option?.textContent).toContain('Small lid');
    option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(emitted).toEqual([
      [
        {
          slug: 'lid-small',
          name: 'Small lid',
          deleted: false,
          unpublished: false,
        },
      ],
    ]);
  });

  // Pairing a product with itself is refused by the API; it is never offered.
  it('offers neither this product nor one already paired', async () => {
    answers = [
      listItem({ slug: 'cup', name: 'The cup itself' }),
      listItem({ slug: 'lid-small', name: 'Small lid' }),
      listItem({ slug: 'lid-large', name: 'Large lid' }),
    ];
    const { el, open, type } = await render([
      {
        slug: 'lid-small',
        name: 'Small lid',
        deleted: false,
        unpublished: false,
      },
    ]);
    await open();

    await type('lid');

    const names = [...el.querySelectorAll('[role="option"]')].map((o) =>
      o.textContent?.trim(),
    );
    expect(names).toEqual(['Large lid']);
  });

  it('does not offer a deleted product as a new counterpart', async () => {
    answers = [
      listItem({
        slug: 'lid-gone',
        name: 'Gone lid',
        deletedAt: '2026-09-01T00:00:00.000Z',
      }),
    ];
    const { el, open, type } = await render();
    await open();

    await type('lid');

    expect(el.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(el.textContent).toContain(text.noSuggestions);
  });

  // The link outlives the counterpart being taken off the storefront: a soft
  // delete is reversible, and dropping it would rewrite the other product's
  // pairings from a screen nobody opened.
  it('lists a deleted counterpart, marked, and removes it only when asked', async () => {
    const { el, emitted } = await render([
      { slug: 'lid-gone', name: 'Gone lid', deleted: true, unpublished: true },
    ]);

    expect(el.textContent).toContain('Gone lid');
    expect(el.textContent).toContain(text.deleted);

    const remove = el.querySelector<HTMLButtonElement>(
      `button[aria-label="${text.remove.replace('{name}', 'Gone lid')}"]`,
    );
    remove?.click();
    expect(emitted).toEqual([[]]);
  });
});
