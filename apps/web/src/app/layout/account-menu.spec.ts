import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AccountMenu } from './account-menu';

const text = defaultAppText.auth;

const admin: AuthUser = { id: 'a', email: 'admin@example.com', role: 'admin' };
const plainUser: AuthUser = {
  id: 'u',
  email: 'user@example.com',
  role: 'user',
};

async function render(initial: AuthUser | null) {
  const user: WritableSignal<AuthUser | null> = signal(initial);
  const logout = vi.fn<AuthService['logout']>().mockImplementation(async () => {
    user.set(null);
  });

  TestBed.configureTestingModule({
    imports: [AccountMenu],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { user, logout } },
    ],
  });

  const fixture = TestBed.createComponent(AccountMenu);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const toggle = () => {
    el.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="menu"]',
    )?.click();
  };
  return { el, user, logout, sync, toggle };
}

describe('AccountMenu', () => {
  it('offers a plain login link while signed out', async () => {
    const { el } = await render(null);

    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/login');
    expect(link?.getAttribute('aria-label')).toBe(text.login);
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('opens a menu for a signed-in admin, pointing at the panel', async () => {
    const { el, toggle, sync } = await render(admin);

    expect(el.querySelector('[role="menu"]')).toBeNull();
    toggle();
    await sync();

    const menu = el.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain(admin.email);
    expect(menu?.textContent).toContain(text.adminPanel);
    expect(menu?.querySelector('a')?.getAttribute('href')).toBe('/admin');
  });

  it('points a plain user at their account page instead', async () => {
    const { el, toggle, sync } = await render(plainUser);

    toggle();
    await sync();

    const menu = el.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain(text.account);
    expect(menu?.querySelector('a')?.getAttribute('href')).toBe('/account');
  });

  it('closes on a click outside', async () => {
    const { el, toggle, sync } = await render(admin);

    toggle();
    await sync();
    expect(el.querySelector('[role="menu"]')).not.toBeNull();

    document.body.click();
    await sync();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('logs out and falls back to the signed-out link', async () => {
    const { el, logout, toggle, sync } = await render(admin);

    toggle();
    await sync();
    el.querySelector<HTMLButtonElement>('[role="menu"] button')?.click();
    await sync();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/login');
  });
});
