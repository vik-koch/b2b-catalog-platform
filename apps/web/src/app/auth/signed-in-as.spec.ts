import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AuthService } from './auth.service';
import { SignedInAs } from './signed-in-as';

const text = defaultAppText.auth;
const admin: AuthUser = { id: 'a', email: 'admin@example.com', role: 'admin' };

async function render(initial: AuthUser | null) {
  const user: WritableSignal<AuthUser | null> = signal(initial);
  const logout = vi.fn<AuthService['logout']>().mockImplementation(async () => {
    user.set(null);
  });

  TestBed.configureTestingModule({
    imports: [SignedInAs],
    providers: [
      provideRouter([{ path: '', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { user, logout } },
    ],
  });

  const fixture = TestBed.createComponent(SignedInAs);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    logout,
    click: () => el.querySelector('button')?.click(),
    sync: async () => {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
      await fixture.whenStable();
    },
  };
}

describe('SignedInAs', () => {
  it('shows who is signed in and the way out', async () => {
    const { el } = await render(admin);

    expect(el.textContent).toContain(text.signedInAs);
    expect(el.textContent).toContain(admin.email);
    expect(el.querySelector('button')?.textContent).toContain(text.logout);
  });

  // Matches what the server renders before /auth/me answers, so hydration has
  // nothing to reconcile.
  it('renders nothing without a session', async () => {
    const { el } = await render(null);

    expect(el.textContent?.trim()).toBe('');
  });

  it('logs out and leaves the gated page', async () => {
    const { el, logout, click, sync } = await render(admin);

    click();
    await sync();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe('/');
    expect(el.textContent?.trim()).toBe('');
  });
});
