import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { loadAdminText } from '../../config/admin-text';
import { ConfirmService } from '../../ui/confirm.service';
import { provideOwnership } from '../settings/settings.fixture';
import { ProductCreateService } from './product-create.service';

describe('ProductCreateService', () => {
  // The service reads the wording as a signal, not through the token: it is
  // also used from the storefront, which is outside the admin text guard.
  afterAll(() => vi.unstubAllGlobals());

  beforeAll(async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(defaultAdminText),
      }),
    );
    await loadAdminText();
  });

  const setup = (owned: 'catalog'[]) => {
    const navigate = vi.fn();
    const tell = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        provideOwnership(...owned),
        { provide: Router, useValue: { navigate } },
        { provide: ConfirmService, useValue: { tell } },
      ],
    });
    return { navigate, tell, service: TestBed.inject(ProductCreateService) };
  };

  it('opens the editor while the catalog is the shop’s own', async () => {
    const { service, navigate, tell } = setup([]);

    await service.start({ category: 'espresso' });

    expect(tell).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/admin/products/new'], {
      queryParams: { category: 'espresso' },
    });
  });

  it('explains who owns the catalog instead of opening an editor', async () => {
    const { service, navigate, tell } = setup(['catalog']);

    await service.start({ category: 'espresso' });

    expect(navigate).not.toHaveBeenCalled();
    expect(tell).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: defaultAdminText.editMode.addProduct,
        message: defaultAdminText.ownership.productCreate,
      }),
    );
  });
});
