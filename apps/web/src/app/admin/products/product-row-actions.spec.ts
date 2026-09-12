import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { ProductRowActions, ProductRowState } from './product-row-actions';

const text = defaultAdminText.editMode;

const product = (
  overrides: Partial<ProductRowState> = {},
): ProductRowState => ({
  slug: 'old-roast',
  name: 'Old Roast',
  publishedAt: null,
  deletedAt: null,
  priceMinor: 990,
  ...overrides,
});

async function render(state: ProductRowState) {
  const tell = vi.fn(async () => undefined);
  TestBed.configureTestingModule({
    imports: [ProductRowActions],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: ConfirmService, useValue: { tell } },
    ],
  });
  const fixture = TestBed.createComponent(ProductRowActions);
  fixture.componentRef.setInput('product', state);
  const toggled = vi.fn();
  fixture.componentInstance.publishToggled.subscribe(toggled);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const publish = () =>
    el.querySelector<HTMLButtonElement>(
      `[aria-label="${text.publishProduct}"]`,
    );
  return { fixture, el, tell, toggled, publish };
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
});
