import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthUser, Page as PageContent } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AuthService } from '../auth/auth.service';
import { Page } from './page';
import { PageService } from './page.service';

const about: PageContent = {
  title: 'About us',
  bodyHtml: '<p>Original copy.</p>',
  updatedAt: '2026-07-25T10:00:00.000Z',
};

const admin: AuthUser = {
  id: 'a1',
  email: 'admin@example.com',
  role: 'admin',
  mustChangePassword: false,
};

async function render(user: AuthUser | null) {
  TestBed.configureTestingModule({
    imports: [Page],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { user: signal(user) } },
      { provide: PageService, useValue: { getPage: async () => about } },
    ],
  });
  const fixture = TestBed.createComponent(Page);
  fixture.componentRef.setInput('slug', 'about');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const editButton = (el: HTMLElement) =>
  el.querySelector(`button[aria-label="${defaultAppText.pageEditor.edit}"]`);

describe('Page', () => {
  it('renders the page title and body', async () => {
    const el = await render(null);

    expect(el.querySelector('h1')?.textContent).toContain('About us');
    expect(el.querySelector('.prose')?.innerHTML).toContain('Original copy.');
  });

  it('offers no edit button to a signed-out visitor', async () => {
    expect(editButton(await render(null))).toBeNull();
  });

  it('offers no edit button to a manager', async () => {
    const el = await render({ ...admin, role: 'manager' });

    expect(editButton(el)).toBeNull();
  });

  it('offers an edit button to an admin', async () => {
    expect(editButton(await render(admin))).not.toBeNull();
  });
});
