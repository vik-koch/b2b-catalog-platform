import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AccountLink } from './account-link';
import { adminUser as admin, plainUser } from '../auth/auth-user.fixture';

const text = defaultAppText.auth;

async function render(initial: AuthUser | null) {
  const user: WritableSignal<AuthUser | null> = signal(initial);

  TestBed.configureTestingModule({
    imports: [AccountLink],
    providers: [
      provideRouter([{ path: 'admin', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { user } },
    ],
  });

  const fixture = TestBed.createComponent(AccountLink);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    link: () => el.querySelector('a'),
    user,
    rerender: async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    },
  };
}

describe('AccountLink', () => {
  it('points a signed-out visitor at the login page', async () => {
    const { link } = await render(null);

    expect(link()?.getAttribute('href')).toBe('/login');
  });

  it('points a signed-in admin at the panel', async () => {
    const { link } = await render(admin);

    expect(link()?.getAttribute('href')).toBe('/admin');
  });

  it('points a plain user at their account page instead', async () => {
    const { link } = await render(plainUser);

    expect(link()?.getAttribute('href')).toBe('/account');
  });

  // The label must not depend on the session at all: the first paint is always
  // the signed-out one, so anything role- or sign-in-dependent would visibly
  // change on every reload once /auth/me answers.
  it('keeps one static label in every state', async () => {
    const { link, user, rerender } = await render(null);
    expect(link()?.textContent).toContain(text.accountNav);

    user.set(admin);
    await rerender();
    expect(link()?.textContent).toContain(text.accountNav);

    user.set(plainUser);
    await rerender();

    expect(link()?.textContent).toContain(text.accountNav);
  });

  // aria-current is both the a11y signal and the hook the active pill styles
  // off, so it has to actually appear when we are on the target page.
  it('marks itself as the current page once its target is active', async () => {
    const { link, rerender } = await render(admin);
    expect(link()?.getAttribute('aria-current')).toBeNull();

    await TestBed.inject(Router).navigateByUrl('/admin');
    await rerender();

    expect(link()?.getAttribute('aria-current')).toBe('page');
  });
});
