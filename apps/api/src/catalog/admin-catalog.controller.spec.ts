import { ConflictException, INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminProductsService } from './admin-products.service';
import { AuditLogger } from '../audit/audit.logger';
import { ContractErrorFilter } from '../orpc/contract-error.filter';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

/**
 * The write surface over a real server. The service raises its refusals as
 * Nest exceptions, so this is where they are proved to arrive as the codes the
 * editor renders — and where the output schema is proved to keep the private
 * sync key off the wire.
 */
describe('AdminCatalogController', () => {
  let app: INestApplication;
  let baseUrl: string;

  const products = {
    listProducts: vi.fn(),
    getProduct: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
  };

  const categories = {
    deleteCategory: vi.fn(),
    createCategory: vi.fn(),
    listCategories: vi.fn(),
  };

  const category = {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'coffee',
    name: 'Coffee',
    parentId: null,
    sortOrder: 0,
    image: null,
    sourceId: 'ERP-CAT-1',
    description: null,
    shortName: null,
    productCount: 0,
    childCount: 0,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCatalogController],
      providers: [
        { provide: AdminProductsService, useValue: products },
        { provide: AdminCategoriesService, useValue: categories },
        { provide: AuditLogger, useValue: { record: vi.fn() } },
        { provide: APP_FILTER, useClass: ContractErrorFilter },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = {
            id: 'admin-1',
            role: 'admin',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    for (const fn of [
      ...Object.values(products),
      ...Object.values(categories),
    ]) {
      fn.mockReset();
    }
  });

  const send = (path: string, method = 'GET', body?: unknown) =>
    fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('sends a category exactly as the contract declares it', async () => {
    categories.listCategories.mockResolvedValue([category]);

    const body = await (await send('/admin/catalog/categories')).json();

    expect(body.categories).toEqual([category]);
  });

  // The output schemas are strict, so a column nobody declared is refused on
  // the way out rather than quietly stripped. A fault is the right answer:
  // the alternative is a response the client cannot have asked for, and a
  // silent strip would let a leak be one `.strict()` away.
  it('refuses to answer with a column the contract does not declare', async () => {
    categories.listCategories.mockResolvedValue([
      { ...category, internalNote: 'do not ship this' },
    ]);

    const response = await send('/admin/catalog/categories');

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(
      'do not ship this',
    );
  });

  it('answers a create with 201, as the contract says', async () => {
    categories.createCategory.mockResolvedValue(category);

    const response = await send('/admin/catalog/categories', 'POST', {
      name: 'Coffee',
    });

    expect(response.status).toBe(201);
  });

  // A conflict the service raises as a Nest exception. Without the refusals
  // middleware this arrives as a 500 and the editor shows "something broke"
  // instead of naming the field.
  it('carries a save conflict through as its declared code', async () => {
    products.updateProduct.mockRejectedValue(
      new ConflictException({
        code: 'slug-taken',
        message: 'Slug already in use',
      }),
    );

    const response = await send(
      '/admin/catalog/products/hafen-espresso',
      'PUT',
      {
        name: 'Hafen Espresso',
        priceMinor: 1999,
        categoryId: category.id,
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      defined: true,
      code: 'slug-taken',
    });
  });

  it('answers a missing product with its own code', async () => {
    products.getProduct.mockResolvedValue(null);

    const response = await send('/admin/catalog/products/nope');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'product-not-found',
    });
  });

  // The one query parameter on a delete: it is what lets a populated category
  // go, so it has to survive the round trip.
  it('passes the reassign target on a category delete', async () => {
    const target = '44444444-4444-4444-8444-444444444444';
    categories.deleteCategory.mockResolvedValue({
      message: 'Category deleted',
    });

    const response = await send(
      `/admin/catalog/categories/${category.id}?reassignTo=${target}`,
      'DELETE',
    );

    expect(response.status).toBe(200);
    expect(categories.deleteCategory).toHaveBeenCalledWith(category.id, target);
  });

  it('omits the reassign target when none was given', async () => {
    categories.deleteCategory.mockResolvedValue({
      message: 'Category deleted',
    });

    await send(`/admin/catalog/categories/${category.id}`, 'DELETE');

    expect(categories.deleteCategory).toHaveBeenCalledWith(
      category.id,
      undefined,
    );
  });

  it('rejects a reassign target that is not a uuid', async () => {
    const response = await send(
      `/admin/catalog/categories/${category.id}?reassignTo=nope`,
      'DELETE',
    );

    expect(response.status).toBe(400);
    expect(categories.deleteCategory).not.toHaveBeenCalled();
  });

  // `/categories/order` and `/categories/{id}` share a prefix; only the method
  // tells them apart.
  it('routes the reorder path to the reorder handler, not to an id', async () => {
    const response = await send('/admin/catalog/categories/order', 'DELETE');

    // A DELETE there is an id that is not a uuid — never the reorder route.
    expect(response.status).toBe(400);
  });

  // The grid's defaults live in the contract; the service is handed the
  // resolved values rather than a bag of maybes.
  it('applies the grid’s query defaults before the service sees them', async () => {
    products.listProducts.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    });

    await send('/admin/catalog/products');

    expect(products.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, state: 'all', q: '' }),
    );
  });
});
