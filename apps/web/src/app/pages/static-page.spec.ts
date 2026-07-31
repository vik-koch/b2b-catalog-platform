import { signal } from '@angular/core';
import { afterAll, beforeAll, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Page as PageContent } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { loadAdminText } from '../config/admin-text';
import { defaultAppText } from '../config/app-text.fixture';
import { defaultAdminText } from '../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { EditModeService } from '../admin/edit-mode.service';
import { StaticPage } from './static-page';
import { PageService } from './page.service';

const about: PageContent = {
  title: 'About us',
  bodyHtml: '<p>Original copy.</p>',
  updatedAt: '2026-07-25T10:00:00.000Z',
};

/** The pencil is an edit-mode affordance; who may enable edit mode (admin only)
 * is EditModeService's concern, so the component test just drives `enabled`. */
/** `null` models a page the deployment publishes but nobody has written yet. */
async function render(
  editModeEnabled: boolean,
  page: PageContent | null = about,
) {
  TestBed.configureTestingModule({
    imports: [StaticPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: {
          branding: { title: 'Test Shop' },
        } as unknown as DeploymentConfig,
      },
      {
        provide: EditModeService,
        useValue: { enabled: signal(editModeEnabled) },
      },
      { provide: PageService, useValue: { getPage: async () => page } },
    ],
  });
  const fixture = TestBed.createComponent(StaticPage);
  fixture.componentRef.setInput('slug', 'about');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const editLink = (el: HTMLElement) =>
  el.querySelector<HTMLAnchorElement>(
    `a[aria-label="${defaultAdminText.pageEditor.edit}"]`,
  );

describe('StaticPage', () => {
  // The pencil's wording comes from the fetched admin text, not the token —
  // this is a public route, so the component reads it as a signal.
  // The stub is global; leaving it installed would hand every later spec in
  // this worker an admin-text response for any fetch it makes.
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

  it('renders the page title and body', async () => {
    const el = await render(false);

    expect(el.querySelector('h1')?.textContent).toContain('About us');
    expect(el.querySelector('.prose')?.innerHTML).toContain('Original copy.');
  });

  it('offers no edit link when edit mode is off', async () => {
    expect(editLink(await render(false))).toBeNull();
  });

  // Editing lives on its own admin route, so the affordance is a link into it
  // rather than an inline toggle.
  // The `from` param is how the editor knows to come back to this page rather
  // than to the admin panel when it closes.
  it('links to the page editor when edit mode is on, carrying a return path', async () => {
    const href = editLink(await render(true))?.getAttribute('href') ?? '';
    const url = new URL(href, 'http://test');

    expect(url.pathname).toBe('/admin/pages/about/edit');
    expect(url.searchParams.get('from')).not.toBeNull();
  });
});

/**
 * Nothing seeds the pages table outside the demo, so on a real deployment every
 * published page starts with no row. That is a state the admin resolves by
 * writing the page — not an error, and not something a crawler should index.
 */
describe('StaticPage — before it has been written', () => {
  // The stub is global; leaving it installed would hand every later spec in
  // this worker an admin-text response for any fetch it makes.
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

  it('shows the 404 view to a visitor', async () => {
    const el = await render(false, null);

    expect(el.querySelector('app-not-found-view')).not.toBeNull();
    expect(el.querySelector('.prose')).toBeNull();
  });

  it('shows an admin the page shell and a link to write it', async () => {
    const el = await render(true, null);

    expect(el.querySelector('app-not-found-view')).toBeNull();
    // Headed by its navigation label, so the page is named before it exists.
    expect(el.querySelector('h1')?.textContent).toContain(
      defaultAppText.nav['about'],
    );
    expect(el.textContent).toContain(defaultAdminText.pageEditor.emptyNotice);
    expect(editLink(el)?.getAttribute('href')).toContain(
      '/admin/pages/about/edit',
    );
  });
});
