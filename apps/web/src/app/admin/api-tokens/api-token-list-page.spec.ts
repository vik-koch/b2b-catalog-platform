import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  API_TOKEN_SCOPES,
  ApiToken,
  CreatedApiToken,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { ApiTokenListPage } from './api-token-list-page';
import { ApiTokensService } from './api-tokens.service';

const text = defaultAdminText.apiTokenList;

function token(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: 'token-1',
    name: 'Nightly import',
    scopes: ['catalog-sync'],
    prefix: 'aB3dEf9h',
    createdAt: '2026-09-01T08:00:00.000Z',
    createdBy: 'admin@example.com',
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

const created: CreatedApiToken = {
  ...token({ id: 'token-2', name: 'Stock feed' }),
  token: 'aB3dEf9h.SECRETVALUE',
};

async function render(
  options: {
    tokens?: ApiToken[];
    create?: CreatedApiToken;
    createFails?: boolean;
    revoke?: Awaited<ReturnType<ApiTokensService['revoke']>>;
    confirmed?: boolean;
  } = {},
) {
  const service = {
    list: vi.fn(async () => options.tokens ?? []),
    create: vi.fn(async () => {
      if (options.createFails) throw new Error('nope');
      return options.create ?? created;
    }),
    revoke: vi.fn(
      async () => options.revoke ?? { ok: true as const, token: token() },
    ),
  };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  TestBed.configureTestingModule({
    imports: [ApiTokenListPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: ApiTokensService, useValue: service },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const fixture = TestBed.createComponent(ApiTokenListPage);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const click = async (selector: string) => {
    el.querySelector<HTMLElement>(selector)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`no field ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const submit = async () => {
    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const byLabel = (label: string) =>
    el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  /**
   * Ticks one capability in the create form, by its accessible name.
   *
   * The boxes sit in a grid of areas and columns rather than in a list of
   * labelled rows, so each carries the full sentence as an `aria-label` — the
   * label a screen reader reads out, which is the one a test should look for
   * too.
   */
  const tick = async (label: string) => {
    const box = el.querySelector<HTMLInputElement>(
      `input[type="checkbox"][aria-label="${label}"]`,
    );
    if (!box) throw new Error(`no capability “${label}”`);
    box.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return { el, service, confirm, click, type, submit, byLabel, tick, fixture };
}

describe('ApiTokenListPage', () => {
  it('says so when there are no tokens', async () => {
    const { el } = await render();

    expect(el.textContent).toContain(text.empty);
  });

  it('lists a token by name, prefix and capabilities, never by value', async () => {
    const { el } = await render({ tokens: [token()] });

    expect(el.textContent).toContain('Nightly import');
    expect(el.textContent).toContain('aB3dEf9h');
    expect(el.textContent).toContain(text.scopes['catalog-sync']);
  });

  /** The field the screen is for: an issued credential nobody has ever used
   * looks exactly like a working one until this line says otherwise. */
  it('distinguishes a token that has never been used from one that has', async () => {
    const { el } = await render({
      tokens: [
        token({ id: 'a', name: 'Idle' }),
        token({
          id: 'b',
          name: 'Busy',
          lastUsedAt: '2026-09-09T06:00:00.000Z',
        }),
      ],
    });

    expect(el.textContent).toContain(text.neverUsed);
    expect(el.textContent).toContain(text.lastUsed.split('{')[0].trim());
  });

  it('names a deleted issuer rather than leaving the line blank', async () => {
    const { el } = await render({ tokens: [token({ createdBy: null })] });

    expect(el.textContent).toContain(text.actorGone);
  });

  it('shows a revoked token, marked, with no revoke button left on it', async () => {
    const { el, byLabel } = await render({
      tokens: [token({ revokedAt: '2026-09-05T00:00:00.000Z' })],
    });

    expect(el.textContent).toContain(text.revoked);
    expect(byLabel(text.revoke)).toBeNull();
  });

  /** There is more than one capability now, so the ticks start empty and the
   * API is never called with a grant nobody made. */
  it('refuses to create a token nobody chose a capability for', async () => {
    const { el, service, click, type, submit } = await render();

    await click('button[appButton]');
    await type('#api-token-name', 'Stock feed');
    await submit();

    expect(el.textContent).toContain(text.scopeRequired);
    expect(service.create).not.toHaveBeenCalled();
  });

  /** One credential, several capabilities: an operator who runs one client for
   * both feeds ticks both rather than managing two secrets. */
  it('lays the capabilities out as areas over read and submit', async () => {
    const { el, click } = await render();
    await click('button[appButton]');

    // The column headings, and one box per capability that exists — the
    // catalog's read square is empty, because nothing reads the catalog
    // outward and a box for it would be a capability nobody can grant.
    expect(el.textContent).toContain(text.scopeKind.read);
    expect(el.textContent).toContain(text.scopeKind.submit);
    expect(el.textContent).toContain(text.scopeArea.orders);
    expect(el.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      API_TOKEN_SCOPES.length,
    );
  });

  it('sends exactly the capabilities that were ticked', async () => {
    const { service, click, type, tick, submit } = await render();

    await click('button[appButton]');
    await type('#api-token-name', 'Stock feed');
    await tick(text.scopes['catalog-sync']);
    await tick(text.scopes['customer-sync']);
    await submit();

    expect(service.create).toHaveBeenCalledWith({
      name: 'Stock feed',
      scopes: ['catalog-sync', 'customer-sync'],
    });
  });

  it('refuses to create a token with no name, without calling the API', async () => {
    const { el, service, click, submit } = await render();

    await click('button[appButton]');
    await submit();

    expect(el.textContent).toContain(text.nameRequired);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates a token and shows its value once', async () => {
    const { el, service, click, type, tick, submit } = await render();

    await click('button[appButton]');
    await type('#api-token-name', '  Stock feed  ');
    await tick(text.scopes['catalog-sync']);
    await submit();

    expect(service.create).toHaveBeenCalledWith({
      name: 'Stock feed',
      scopes: ['catalog-sync'],
    });
    expect(el.textContent).toContain(created.token);
    expect(el.textContent).toContain(text.createdOnce);
  });

  it('clears the value only when it is dismissed', async () => {
    const { el, click, type, tick, submit, fixture } = await render();

    await click('button[appButton]');
    await type('#api-token-name', 'Stock feed');
    await tick(text.scopes['catalog-sync']);
    await submit();
    expect(el.textContent).toContain(created.token);

    const dismiss = [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === text.createdDone,
    );
    dismiss?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).not.toContain(created.token);
  });

  it('reports a failed create without pretending one was issued', async () => {
    const { el, click, type, tick, submit } = await render({
      createFails: true,
    });

    await click('button[appButton]');
    await type('#api-token-name', 'Stock feed');
    await tick(text.scopes['catalog-sync']);
    await submit();

    expect(el.textContent).toContain(text.createError);
    expect(el.textContent).not.toContain(created.token);
  });

  it('asks before revoking, and does nothing when the answer is no', async () => {
    const { service, confirm, byLabel } = await render({
      tokens: [token()],
      confirmed: false,
    });

    byLabel(text.revoke)?.click();
    await Promise.resolve();

    expect(confirm.ask).toHaveBeenCalled();
    expect(service.revoke).not.toHaveBeenCalled();
  });

  it('revokes a token once the question is answered', async () => {
    const { service, byLabel } = await render({ tokens: [token()] });

    byLabel(text.revoke)?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.revoke).toHaveBeenCalledWith('token-1');
  });
});
