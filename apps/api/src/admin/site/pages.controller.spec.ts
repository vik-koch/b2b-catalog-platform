import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminPagesController } from './pages.controller';
import { PageEditorService } from './page-editor.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';

/** Over a real server: routing, validation and the refusal's shape are the
 * contract layer's work, which a call on the handler would skip. */
describe('AdminPagesController', () => {
  let app: INestApplication;
  let baseUrl: string;
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
      controllers: [AdminPagesController],
      providers: [
        {
          provide: PageEditorService,
          useValue: { updatePage, listVersions },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          // Throws like the real guard: a `false` would be a 403.
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
    updatePage.mockReset();
    listVersions.mockReset();
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
    updatePage.mockResolvedValue({ ...page, consentLabel: 'I [consent].' });

    const response = await put('consent-account', {
      title: 'Consent',
      bodyHtml: '',
      consentLabel: 'I [consent].',
    });

    expect(response.status).toBe(200);
  });

  it('refuses box wording that marks no link to the text', async () => {
    signedInAs = { id: 'admin-1', role: 'admin' };

    const response = await put('consent-account', {
      title: 'Consent',
      bodyHtml: '',
      consentLabel: 'I consent.',
    });

    expect(response.status).toBe(400);
    expect(updatePage).not.toHaveBeenCalled();
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
      consentLabel: 'I [consent].',
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
