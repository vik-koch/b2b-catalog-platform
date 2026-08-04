import { TestBed } from '@angular/core/testing';
import { AdminCategory } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { AdminCatalogService } from '../admin-catalog.service';
import { CategoryDeleteDialog } from './category-delete-dialog';

// jsdom's <dialog> has no showModal/close; the dialog opens itself on render.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

function cat(over: Partial<AdminCategory>): AdminCategory {
  return {
    id: 'id',
    slug: 'slug',
    name: 'Name',
    parentId: null,
    sortOrder: 0,
    image: null,
    sourceId: 'manual:x',
    description: null,
    productCount: 0,
    childCount: 0,
    ...over,
  };
}

interface Internals {
  mode(): string;
  destinations(): AdminCategory[];
  reassignTo: { set(v: string): void };
  confirm(): Promise<void>;
}

async function render(
  categories: AdminCategory[],
  target: AdminCategory,
  deleteCategory = vi.fn().mockResolvedValue({ ok: true }),
) {
  TestBed.configureTestingModule({
    imports: [CategoryDeleteDialog],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      {
        provide: AdminCatalogService,
        useValue: {
          listCategories: () => Promise.resolve(categories),
          deleteCategory,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CategoryDeleteDialog);
  fixture.componentRef.setInput('slug', target.slug);
  fixture.componentRef.setInput('name', target.name);
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    ci: fixture.componentInstance as unknown as Internals,
    deleteCategory,
  };
}

describe('CategoryDeleteDialog', () => {
  it('blocks a category that still has subcategories', async () => {
    const self = cat({ id: 's', slug: 'parent', childCount: 2 });
    const { ci } = await render([self], self);

    expect(ci.mode()).toBe('blocked-children');
  });

  it('asks for a reassign destination when the category has products', async () => {
    const self = cat({ id: 's', slug: 'roasts', productCount: 5 });
    const other = cat({ id: 'o', slug: 'other' });
    const { ci } = await render([self, other], self);

    expect(ci.mode()).toBe('reassign');
    // The category being deleted is never a valid destination for its products.
    expect(ci.destinations().map((c) => c.id)).toEqual(['o']);
  });

  it('offers a plain confirm for an empty category', async () => {
    const self = cat({ id: 's', slug: 'empty' });
    const { ci } = await render([self], self);

    expect(ci.mode()).toBe('confirm');
  });

  it('deletes with the chosen reassign target and emits deleted', async () => {
    const self = cat({ id: 's', slug: 'roasts', productCount: 5 });
    const other = cat({ id: 'o', slug: 'other' });
    const { fixture, ci, deleteCategory } = await render([self, other], self);
    const deleted = vi.fn();
    fixture.componentInstance.deleted.subscribe(deleted);

    ci.reassignTo.set('o');
    await ci.confirm();

    expect(deleteCategory).toHaveBeenCalledWith('s', 'o');
    expect(deleted).toHaveBeenCalled();
  });
});
