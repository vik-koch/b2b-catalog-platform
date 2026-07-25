import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { adminUser } from './auth-user.fixture';
import { AuthService, ChangePasswordResult } from './auth.service';
import { ForcePasswordChange } from './force-password-change';

const text = defaultAppText.auth.changePassword;

/**
 * jsdom parses <dialog> but implements none of its behaviour — no showModal, no
 * close, no `open` bookkeeping. Enough of it to assert against; the real focus
 * trap and backdrop are the browser's job and are covered by the e2e suite.
 */
beforeAll(() => {
  const dialog = HTMLDialogElement.prototype;
  dialog.showModal = function () {
    this.open = true;
  };
  dialog.close = function () {
    this.open = false;
  };
});

async function render(
  initial: AuthUser | null,
  result: ChangePasswordResult = 'ok',
) {
  const user: WritableSignal<AuthUser | null> = signal(initial);
  // Mirrors the real service: the success response carries the refreshed
  // identity, so the flag clears as part of changing the password.
  const changePassword = vi
    .fn<AuthService['changePassword']>()
    .mockImplementation(async () => {
      if (result === 'ok') {
        const current = user();
        if (current) user.set({ ...current, mustChangePassword: false });
      }
      return result;
    });
  const logout = vi
    .fn<AuthService['logout']>()
    .mockImplementation(async () => user.set(null));

  TestBed.configureTestingModule({
    imports: [ForcePasswordChange],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { user, changePassword, logout } },
    ],
  });

  const navigateByUrl = vi
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockResolvedValue(true);

  const fixture = TestBed.createComponent(ForcePasswordChange);
  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const dialog = () => el.querySelector('dialog');
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const changePasswordTo = (value: string) => {
    for (const [selector, entry] of [
      ['#forced-change-password-current', 'old-secret'],
      ['#forced-change-password-new', value],
      ['#forced-change-password-confirm', value],
    ] as const) {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`no element for ${selector}`);
      input.value = entry;
      input.dispatchEvent(new Event('input'));
    }
    el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  };

  return {
    fixture,
    el,
    dialog,
    user,
    logout,
    navigateByUrl,
    changePasswordTo,
    sync,
  };
}

describe('ForcePasswordChange', () => {
  it('renders nothing for a guest', async () => {
    const { dialog } = await render(null);

    expect(dialog()).toBeNull();
  });

  it('renders nothing for an account that chose its own password', async () => {
    const { dialog } = await render(adminUser);

    expect(dialog()).toBeNull();
  });

  it('opens as a modal when the account still owes a change', async () => {
    const { dialog, el } = await render({
      ...adminUser,
      mustChangePassword: true,
    });

    expect(dialog()?.open).toBe(true);
    expect(el.textContent).toContain(text.forcedIntro);
  });

  it('keeps the dialog up on success until the confirmation is acknowledged', async () => {
    const { el, dialog, changePasswordTo, sync } = await render({
      ...adminUser,
      mustChangePassword: true,
    });

    changePasswordTo('a-brand-new-password');
    await sync();

    // The flag has already cleared; the dialog stays so the outcome is visible.
    expect(dialog()).not.toBeNull();
    expect(el.textContent).toContain(text.success);
    expect(el.textContent).not.toContain(text.forcedIntro);

    el.querySelector<HTMLButtonElement>('button[type="button"]')?.click();
    await sync();

    expect(dialog()).toBeNull();
  });

  it('offers logging out as the way past it, for someone who cannot produce the current password', async () => {
    const { el, dialog, logout, navigateByUrl, sync } = await render({
      ...adminUser,
      mustChangePassword: true,
    });

    const buttons = [
      ...el.querySelectorAll<HTMLButtonElement>('button[type="button"]'),
    ];
    const logoutButton = buttons.find((b) =>
      b.textContent?.includes(defaultAppText.auth.logout),
    );
    logoutButton?.click();
    await sync();

    expect(logout).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/');
    expect(dialog()).toBeNull();
  });
});
