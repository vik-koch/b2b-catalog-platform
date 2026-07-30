import { signal } from '@angular/core';
import { beforeAll, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Page as PageContent } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { loadAdminText } from '../config/admin-text';
import { defaultAppText } from '../config/app-text.fixture';
import { defaultAdminText } from '../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { EditModeService } from '../admin/edit-mode.service';
import { Page } from './page';
import { PageService } from './page.service';

const about: PageContent = {
  title: 'About us',
  bodyHtml: '<p>Original copy.</p>',
  updatedAt: '2026-07-25T10:00:00.000Z',
};

/** The pencil is an edit-mode affordance; who may enable edit mode (admin only)
 * is EditModeService's concern, so the component test just drives `enabled`. */
async function render(editModeEnabled: boolean) {
  TestBed.configureTestingModule({
    imports: [Page],
    providers: [
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
      { provide: PageService, useValue: { getPage: async () => about } },
    ],
  });
  const fixture = TestBed.createComponent(Page);
  fixture.componentRef.setInput('slug', 'about');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const editButton = (el: HTMLElement) =>
  el.querySelector(`button[aria-label="${defaultAdminText.pageEditor.edit}"]`);

describe('Page', () => {
  // The pencil's wording comes from the fetched admin text, not the token —
  // this is a public route, so the component reads it as a signal.
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

  it('offers no edit button when edit mode is off', async () => {
    expect(editButton(await render(false))).toBeNull();
  });

  it('offers an edit button when edit mode is on', async () => {
    expect(editButton(await render(true))).not.toBeNull();
  });
});
