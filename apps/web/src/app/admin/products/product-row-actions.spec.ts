import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { OwnershipArea } from '@b2b-catalog-platform/shared';
import { ConfirmService } from '../../ui/confirm.service';
import { provideOwnership } from '../settings/settings.fixture';
import { ProductRowActions, ProductRowState } from './product-row-actions';

const text = defaultAdminText.editMode;

const product = (
  overrides: Partial<ProductRowState> = {},
): ProductRowState => ({
  slug: 'old-roast',
  name: 'Old Roast',
  publishedAt: null,
  deletedAt: null,
  deletedByRun: false,
  priceMinor: 990,
  ...overrides,
});

async function render(state: ProductRowState, owned: OwnershipArea[] = []) {
  const tell = vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    imports: [ProductRowActions],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: ConfirmService, useValue: { tell } },
      provideOwnership(...owned),
    ],
  });
  const fixture = TestBed.createComponent(ProductRowActions);
  fixture.componentRef.setInput('product', state);
  const toggled = vi.fn();
  fixture.componentInstance.publishToggled.subscribe(toggled);
  const deleteRequested = vi.fn();
  fixture.componentInstance.deleteRequested.subscribe(deleteRequested);
  const restored = vi.fn();
  fixture.componentInstance.restored.subscribe(restored);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const publish = () =>
    el.querySelector<HTMLButtonElement>(
      `[aria-label="${text.publishProduct}"]`,
    );
  const byLabel = (label: string) =>
    el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  return {
    fixture,
    el,
    tell,
    toggled,
    publish,
    byLabel,
    deleteRequested,
    restored,
  };
}

describe('ProductRowActions', () => {
  it('switches publication on a product that has a price', async () => {
    const { fixture, publish, toggled, tell } = await render(product());

    publish()?.click();
    await fixture.whenStable();

    expect(toggled).toHaveBeenCalled();
    expect(tell).not.toHaveBeenCalled();
  });

  it('answers a product nothing prices with the reason, not a request', async () => {
    const { fixture, publish, toggled, tell } = await render(
      product({ priceMinor: null }),
    );

    // Live, not disabled: the server refuses this publish either way, and a
    // dead button says only that something is wrong with it.
    expect(publish()?.disabled).toBe(false);
    publish()?.click();
    await fixture.whenStable();

    expect(toggled).not.toHaveBeenCalled();
    expect(tell).toHaveBeenCalledWith(
      expect.objectContaining({ heading: text.unpricedTitle }),
    );
  });

  it('always offers to take a published product off the storefront', async () => {
    const { el } = await render(
      product({ publishedAt: '2026-08-02T09:00:00.000Z', priceMinor: null }),
    );

    expect(
      el.querySelector(`[aria-label="${text.unpublishProduct}"]`),
    ).not.toBeNull();
  });

  describe('removal steps (FR-ADM-01)', () => {
    // Three fixed places: edit, the step forward, the step back.
    const offered = (byLabel: (label: string) => HTMLButtonElement | null) =>
      [
        text.publishProduct,
        text.unpublishProduct,
        text.deleteProduct,
        defaultAdminText.common.restore,
      ].filter((label) => byLabel(label) !== null);

    it('offers a published product only unpublish', async () => {
      const { byLabel } = await render(
        product({ publishedAt: '2026-08-02T09:00:00.000Z' }),
      );

      expect(offered(byLabel)).toEqual([text.unpublishProduct]);
    });

    it('offers an unpublished product publish and delete', async () => {
      const { byLabel } = await render(product());

      expect(offered(byLabel)).toEqual([
        text.publishProduct,
        text.deleteProduct,
      ]);
    });

    it('offers a deleted product only restore, published or not', async () => {
      const { byLabel } = await render(
        product({
          deletedAt: '2026-08-03T09:00:00.000Z',
          publishedAt: '2026-08-02T09:00:00.000Z',
        }),
      );

      expect(offered(byLabel)).toEqual([defaultAdminText.common.restore]);
    });

    it('keeps the place a state has nothing for, so the columns line up', async () => {
      const { el } = await render(
        product({ publishedAt: '2026-08-02T09:00:00.000Z' }),
      );

      // Edit, an empty place, unpublish.
      expect(el.children).toHaveLength(3);
      expect(el.children[1].getAttribute('aria-hidden')).toBe('true');
    });

    it('deletes an unpublished product without asking', async () => {
      const { fixture, byLabel, deleteRequested, tell } =
        await render(product());

      byLabel(text.deleteProduct)?.click();
      await fixture.whenStable();

      expect(deleteRequested).toHaveBeenCalled();
      expect(tell).not.toHaveBeenCalled();
    });

    it('explains instead of restoring what a run deleted while the catalog is owned', async () => {
      const { fixture, byLabel, restored, tell } = await render(
        product({
          deletedAt: '2026-08-03T09:00:00.000Z',
          deletedByRun: true,
        }),
        ['catalog'],
      );

      byLabel(defaultAdminText.common.restore)?.click();
      await fixture.whenStable();

      expect(restored).not.toHaveBeenCalled();
      expect(tell).toHaveBeenCalledWith(
        expect.objectContaining({
          heading: defaultAdminText.ownership.productRestoreTitle,
        }),
      );
    });

    it('restores what a run deleted once nobody owns the catalog', async () => {
      const { fixture, byLabel, restored } = await render(
        product({
          deletedAt: '2026-08-03T09:00:00.000Z',
          deletedByRun: true,
        }),
      );

      byLabel(defaultAdminText.common.restore)?.click();
      await fixture.whenStable();

      expect(restored).toHaveBeenCalled();
    });
  });
});
