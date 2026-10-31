import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PageController } from './page.controller';
import { PageService } from './page.service';

/** Over a real server: routing, validation and the refusal's shape are the
 * contract layer's work, which a call on the handler would skip. */
describe('PageController', () => {
  let app: INestApplication;
  let baseUrl: string;
  const getPage = vi.fn();

  const page = {
    version: 1,
    title: 'Privacy',
    bodyHtml: '<p>How we handle data.</p>',
    consentLabel: null,
    updatedAt: '2026-09-02T10:00:00.000Z',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PageController],
      providers: [{ provide: PageService, useValue: { getPage } }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    getPage.mockReset();
  });

  it('serves a page at the path the contract declares', async () => {
    getPage.mockResolvedValue(page);

    const response = await fetch(`${baseUrl}/api/pages/privacy`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(getPage).toHaveBeenCalledWith('privacy');
  });

  it('answers a declared 404 with its code when there is no row', async () => {
    getPage.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/pages/privacy`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'page-not-found' });
  });

  it('sends only what the contract declares, never the whole row', async () => {
    getPage.mockResolvedValue({ ...page, id: 42, updatedBy: 'admin-1' });

    const body = await (await fetch(`${baseUrl}/api/pages/privacy`)).json();

    expect(body).toEqual(page);
  });
});
