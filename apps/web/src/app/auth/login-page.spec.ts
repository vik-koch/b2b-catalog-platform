import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AuthService, LoginResult } from './auth.service';
import { LoginPage } from './login-page';
import { adminUser as admin, plainUser } from './auth-user.fixture';

const text = defaultAppText.auth;

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submitForm(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
}

async function render(result: LoginResult = 'ok', signedIn: AuthUser = admin) {
  const user = signal<AuthUser | null>(null);
  const login = vi.fn<AuthService['login']>().mockImplementation(async () => {
    if (result === 'ok') user.set(signedIn);
    return result;
  });

  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { user, login } },
    ],
  });

  const navigateByUrl = vi
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockResolvedValue(true);

  const fixture = TestBed.createComponent(LoginPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  // Flush a macrotask so submit()'s awaited promise settles before asserting.
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, el, login, navigateByUrl, sync };
}

describe('LoginPage', () => {
  it('blocks submit and reports both missing fields', async () => {
    const { el, login, sync } = await render();

    submitForm(el);
    await sync();

    expect(login).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.emailRequired);
    expect(el.textContent).toContain(text.validation.passwordRequired);
  });

  it('rejects an address the server would reject (shared Zod email rule)', async () => {
    const { el, login, sync } = await render();

    setInput(el, '#email', 'admin@example');
    setInput(el, '#password', 'secret');
    submitForm(el);
    await sync();

    expect(login).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.emailInvalid);
  });

  it('signs an admin in and lands them in the panel', async () => {
    const { el, login, navigateByUrl, sync } = await render('ok', admin);

    setInput(el, '#email', 'admin@example.com');
    setInput(el, '#password', 'secret');
    submitForm(el);
    await sync();

    expect(login).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'secret',
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  it('lands a plain user on their account page instead', async () => {
    const { el, navigateByUrl, sync } = await render('ok', plainUser);

    setInput(el, '#email', 'user@example.com');
    setInput(el, '#password', 'secret');
    submitForm(el);
    await sync();

    expect(navigateByUrl).toHaveBeenCalledWith('/account');
  });

  it('returns to the page the guard bounced them from', async () => {
    const { fixture, el, navigateByUrl, sync } = await render();
    fixture.componentRef.setInput('returnUrl', '/admin/pages/imprint');

    setInput(el, '#email', 'admin@example.com');
    setInput(el, '#password', 'secret');
    submitForm(el);
    await sync();

    expect(navigateByUrl).toHaveBeenCalledWith('/admin/pages/imprint');
  });

  it('ignores an off-site returnUrl rather than following it', async () => {
    const { fixture, el, navigateByUrl, sync } = await render();
    fixture.componentRef.setInput('returnUrl', '//evil.example/phish');

    setInput(el, '#email', 'admin@example.com');
    setInput(el, '#password', 'secret');
    submitForm(el);
    await sync();

    expect(navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  it('shows the credentials message on a rejected login and stays put', async () => {
    const { el, navigateByUrl, sync } = await render('invalid');

    setInput(el, '#email', 'admin@example.com');
    setInput(el, '#password', 'wrong');
    submitForm(el);
    await sync();

    expect(el.textContent).toContain(text.invalid);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('distinguishes a failure that is not the credentials', async () => {
    const { el, sync } = await render('error');

    setInput(el, '#email', 'admin@example.com');
    setInput(el, '#password', 'secret');
    submitForm(el);
    await sync();

    expect(el.textContent).toContain(text.error);
    expect(el.textContent).not.toContain(text.invalid);
  });

  // The only route to registration: a visitor who has no account has to be
  // offered one here, not left to guess the URL.
  it('offers signing up, as a link to the register page', async () => {
    const { el } = await render();

    const cta = el.querySelector<HTMLAnchorElement>('a[href="/register"]');
    expect(cta?.textContent).toContain(text.register.signUp);
    expect(el.textContent).toContain(text.register.noAccount);
  });
});
