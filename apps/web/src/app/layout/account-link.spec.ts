import { computed, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthUser, UserRole } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AccountLink } from './account-link';
import { adminUser as admin, plainUser } from '../auth/auth-user.fixture';

const text = defaultAppText.auth;

/**
 * `undefined` is the third state the component has to tell apart: the session
 * is not known yet, which is what every first paint starts in. `hint` is what
 * the browser's own cookies say in the meantime — the readable companion to the
 * httpOnly session cookie.
 */
async function render(
  initial: AuthUser | null | undefined,
  hint: UserRole | null = null,
) {
  const session: WritableSignal<AuthUser | null | undefined> = signal(initial);
  const user = computed(() => session() ?? null);
  const resolved = computed(() => session() !== undefined);
  const hintedRole = signal(hint);

  TestBed.configureTestingModule({
    imports: [AccountLink],
    providers: [
      provideRouter([{ path: 'admin', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { user, resolved, hintedRole } },
    ],
  });

  const fixture = TestBed.createComponent(AccountLink);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    link: () => el.querySelector('a'),
    // What the control announces: the faded-out label is aria-hidden, so the
    // accessible name is the one label that is actually being shown.
    label: () =>
      Array.from(el.querySelectorAll('span[class*="row-start-1"]'))
        .filter((span) => !span.hasAttribute('aria-hidden'))
        .map((span) => span.textContent?.trim())
        .join(' '),
    faded: (label: string) =>
      Array.from(el.querySelectorAll('span[class*="row-start-1"]')).some(
        (span) =>
          span.textContent?.trim() === label &&
          span.className.includes('opacity-0'),
      ),
    user: session,
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

  // The server cannot resolve a session, so until /auth/me answers the control
  // draws what the browser's own hint says — which is the answer, not a lean.
  it('offers to log in while unresolved and the browser has no hint', async () => {
    const { label, link } = await render(undefined);

    expect(label()).toBe(text.login);
    expect(link()?.getAttribute('href')).toBe('/login');
  });

  it('draws the hint while the session is still being resolved', async () => {
    const { label, link } = await render(undefined, 'user');

    expect(label()).toBe(text.accountNav);
    // The hint carries the role, so the destination is right too.
    expect(link()?.getAttribute('href')).toBe('/account');
  });

  // The one case a hint cannot cover: a session ended somewhere else, still in
  // the cookie jar. The answer wins as soon as there is one.
  it('gives way to the answer when it contradicts the hint', async () => {
    const { label, user, rerender } = await render(undefined, 'user');
    expect(label()).toBe(text.accountNav);

    user.set(null);
    await rerender();

    expect(label()).toBe(text.login);
  });

  // Both labels stay in the DOM so the swap is a cross-fade in one cell rather
  // than a blink: the hidden one is faded and taken out of the accessible name.
  it('cross-fades between the two labels rather than replacing one', async () => {
    const { link, faded, user, rerender } = await render(undefined, 'user');
    expect(link()?.textContent).toContain(text.accountNav);
    expect(link()?.textContent).toContain(text.login);
    expect(faded(text.login)).toBe(true);
    expect(faded(text.accountNav)).toBe(false);

    user.set(null);
    await rerender();

    expect(faded(text.accountNav)).toBe(true);
    expect(faded(text.login)).toBe(false);
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
