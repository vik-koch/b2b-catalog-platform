import { TestBed } from '@angular/core/testing';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { AdminCatalogService } from '../admin-catalog.service';
import { provideOwnership } from '../settings/settings.fixture';
import { ProductDeleteDialog } from './product-delete-dialog';

/**
 * The dialog both delete affordances open — the admin row and the storefront's
 * edit-mode bin — which is why teaching it the locked state covers both.
 */
async function render(catalogOwned: boolean) {
  const deleteProduct = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    providers: [
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: AdminCatalogService, useValue: { deleteProduct } },
      catalogOwned ? provideOwnership('catalog') : provideOwnership(),
    ],
  });

  const fixture = TestBed.createComponent(ProductDeleteDialog);
  fixture.componentRef.setInput('slug', 'coffee-beans');
  fixture.componentRef.setInput('name', 'Coffee Beans');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, deleteProduct };
}

const buttonLabels = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());

describe('ProductDeleteDialog', () => {
  it('asks for confirmation when the shop owns its own catalog', async () => {
    const { el } = await render(false);

    expect(el.textContent).toContain('Coffee Beans');
    expect(buttonLabels(el)).toContain(defaultAdminText.editMode.deleteProduct);
  });

  describe('while an external system owns the catalog', () => {
    it('explains instead of asking', async () => {
      const { el } = await render(true);

      expect(el.textContent).toContain(
        defaultAdminText.ownership.productDelete,
      );
    });

    it('offers nothing to confirm, only a way out', async () => {
      // The control that opened it is deliberately still in the row: the same
      // rule greys the editor's fields rather than removing them.
      const { el } = await render(true);

      const labels = buttonLabels(el);
      expect(labels).not.toContain(defaultAdminText.editMode.deleteProduct);
      expect(labels).toContain(defaultAdminText.common.close);
    });

    it('cannot delete even if the confirm were reached', async () => {
      const { el, deleteProduct } = await render(true);

      el.querySelectorAll('button').forEach((b) => b.click());

      expect(deleteProduct).not.toHaveBeenCalled();
    });
  });
});
