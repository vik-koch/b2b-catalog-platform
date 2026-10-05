import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PageController } from './page.controller';
import { PageService } from './page.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

/**
 * The controller over a real HTTP server, because that is where the contract
 * layer actually does its work: routing, path params, request and response
 * validation, and the shape a declared refusal arrives in. A unit call on the
 * handler would exercise none of it.
 */
describe('PageController', () => {
  let app: INestApplication;
  let baseUrl: string;
  const getPage = vi.fn();
  const updatePage = vi.fn();
  const listVersions = vi.fn();
  let signedInAs: { id: string; role: string } | null = null;

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
      providers: [
        {
          provide: PageService,
          useValue: { getPage, updatePage, listVersions },
        },
      ],
    })
      // The guards are exercised in their own specs; here they only have to
      // decide, so that this spec can prove the refusal reaches the client in
      // the shape the contract declares.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          // Throwing rather than returning false, as the real guard does: a
          // guard that merely declines gets Nest's default 403, and the
          // difference between "who are you" and "not you" is the difference
          // between the sign-in form and the refusal screen.
          if (!signedInAs) throw new UnauthorizedException();
          context.switchToHttp().getRequest().user = signedInAs;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => signedInAs?.role === 'admin' })
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
    signedInAs = null;
    getPage.mockReset();
    updatePage.mockReset();
    listVersions.mockReset();
  });

  it('serves a page at the path the contract declares', async () => {
    getPage.mockResolvedValue(page);

    const response = await fetch(`${baseUrl}/api/pages/privacy`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(getPage).toHaveBeenCalledWith('privacy');
  });

  // The refusal a missing row turns into, and the reason the client can tell
  // it apart from an outage: a code, not a message.
  it('answers a declared 404 with its code when there is no row', async () => {
    getPage.mockResolvedValue(null);

    const response = await fetch(`${baseUrl}/api/pages/privacy`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'page-not-found' });
  });

  // Without an output schema the raw row, internal id column and all, is what
  // would go out.
  it('sends only what the contract declares, never the whole row', async () => {
    getPage.mockResolvedValue({ ...page, id: 42, updatedBy: 'admin-1' });

    const body = await (await fetch(`${baseUrl}/api/pages/privacy`)).json();

    expect(body).toEqual(page);
  });

  it('refuses an edit from nobody', async () => {
    const response = await fetch(`${baseUrl}/api/pages/privacy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New', bodyHtml: '<p>x</p>' }),
    });

    expect(response.status).toBe(401);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it('lets an admin through, and hands the service the signed-in account', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };
    updatePage.mockResolvedValue(page);

    const response = await fetch(`${baseUrl}/api/pages/privacy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Privacy', bodyHtml: '<p>x</p>' }),
    });

    expect(response.status).toBe(200);
    expect(updatePage).toHaveBeenCalledWith(
      'privacy',
      { title: 'Privacy', bodyHtml: '<p>x</p>' },
      expect.objectContaining({ id: 'admin-1' }),
    );
  });

  const put = (slug: string, body: object) =>
    fetch(`${baseUrl}/api/pages/${slug}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('takes box wording on a consent page', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };
    updatePage.mockResolvedValue({ ...page, consentLabel: 'I consent.' });

    const response = await put('consent-account', {
      title: 'Consent',
      bodyHtml: '',
      consentLabel: 'I consent.',
    });

    expect(response.status).toBe(200);
  });

  it('refuses a consent page without its box wording', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await put('consent-account', {
      title: 'Consent',
      bodyHtml: '',
    });

    expect(response.status).toBe(400);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it('refuses box wording on any other page', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await put('privacy', {
      title: 'Privacy',
      bodyHtml: '',
      consentLabel: 'I consent.',
    });

    expect(response.status).toBe(400);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it('lists the versions to an admin only', async () => {
    listVersions.mockResolvedValue([{ ...page, editorEmail: null }]);

    const refused = await fetch(`${baseUrl}/api/pages/privacy/versions`);
    expect(refused.status).toBe(401);

    signedInAs = { id: 'admin-1', role: 'admin' };
    const response = await fetch(`${baseUrl}/api/pages/privacy/versions`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ ...page, editorEmail: null }]);
    expect(listVersions).toHaveBeenCalledWith('privacy');
  });

  // The slug enum is what makes "create a page" unrepresentable.
  it('rejects a slug that is not one of the fixed pages', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/pages/pricing`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Pricing', bodyHtml: '' }),
    });

    expect(response.status).toBe(400);
    expect(updatePage).not.toHaveBeenCalled();
  });

  // strict: unknown keys are rejected, not stripped (NFR-SEC-05).
  it('rejects a body carrying a field the contract does not declare', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await fetch(`${baseUrl}/api/pages/privacy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Privacy',
        bodyHtml: '',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    });

    expect(response.status).toBe(400);
    expect(updatePage).not.toHaveBeenCalled();
  });
});
