import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { productListItem } from '../catalog/product.fixture';
import { AuthService } from '../auth/auth.service';
import { CatalogService } from '../catalog/catalog.service';
import { FeaturedRowService } from './featured-row.service';

function setup(platform: 'browser' | 'server' = 'browser') {
  const session = signal<{ id: string } | null | undefined>(undefined);
  let draws = 0;
  const getFeaturedProducts = vi.fn(async () => [
    productListItem({ slug: `draw-${++draws}` }),
  ]);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: CatalogService, useValue: { getFeaturedProducts } },
      {
        provide: AuthService,
        useValue: {
          resolved: () => session() !== undefined,
          user: () => session() ?? null,
        },
      },
    ],
  });
  const service = TestBed.inject(FeaturedRowService);
  TestBed.tick();
  return { service, session, getFeaturedProducts };
}

const slugOf = async (service: FeaturedRowService) =>
  (await service.row())?.[0].slug;

describe('FeaturedRowService', () => {
  it('hands back the first draw on the way back to the main page', async () => {
    const { service, getFeaturedProducts } = setup();

    expect(await slugOf(service)).toBe('draw-1');
    expect(await slugOf(service)).toBe('draw-1');
    expect(getFeaturedProducts).toHaveBeenCalledTimes(1);
  });

  // The draw that preceded the session's answer already carried the cookie,
  // so its prices are the visitor's own.
  it('keeps it when the session first answers', async () => {
    const { service, session } = setup();
    await service.row();

    session.set({ id: 'user-1' });
    TestBed.tick();

    expect(await slugOf(service)).toBe('draw-1');
  });

  it('draws again once somebody signs in, since the prices were a guest’s', async () => {
    const { service, session } = setup();
    session.set(null);
    TestBed.tick();
    await service.row();

    session.set({ id: 'user-1' });
    TestBed.tick();

    expect(await slugOf(service)).toBe('draw-2');
  });

  it('draws again once they sign out', async () => {
    const { service, session } = setup();
    session.set({ id: 'user-1' });
    TestBed.tick();
    await service.row();

    session.set(null);
    TestBed.tick();

    expect(await slugOf(service)).toBe('draw-2');
  });

  // A server render is one document with no way back to keep it for; the
  // browser takes its row over through the transfer cache.
  it('keeps nothing on the server', async () => {
    const { service, getFeaturedProducts } = setup('server');

    await service.row();
    await service.row();

    expect(getFeaturedProducts).toHaveBeenCalledTimes(2);
  });
});
