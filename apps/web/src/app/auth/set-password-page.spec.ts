import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AuthService } from './auth.service';
import { adminUser } from './auth-user.fixture';
import { SetPasswordPage } from './set-password-page';

const text = defaultAppText.auth.setPassword;

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function render(
  options: {
    account?: { purpose: 'set' | 'reset'; email: string } | null;
    outcome?: Awaited<ReturnType<AuthService['setPassword']>>;
  } = {},
) {
  const account =
    options.account === undefined
      ? { purpose: 'set' as const, email: 'jane@example.com' }
      : options.account;
  const user = signal<AuthUser | null>(null);
  const checkPasswordToken = vi
    .fn<AuthService['checkPasswordToken']>()
    .mockResolvedValue(account);
  const setPassword = vi
    .fn<AuthService['setPassword']>()
    .mockImplementation(async () => {
      const outcome = options.outcome ?? { result: 'ok' as const };
      if (outcome.result === 'ok') user.set(adminUser);
      return outcome;
    });

  TestBed.configureTestingModule({
    imports: [SetPasswordPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: AuthService,
        useValue: { checkPasswordToken, setPassword, user },
      },
    ],
  });

  const navigateByUrl = vi
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockResolvedValue(true);

  const fixture = TestBed.createComponent(SetPasswordPage);
  fixture.componentRef.setInput('token', 'a-token');
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await sync();

  const el = fixture.nativeElement as HTMLElement;
  const submit = () =>
    el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  const clickText = (label: string) =>
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes(label))
      ?.click();

  return { el, sync, submit, clickText, setPassword, navigateByUrl };
}

describe('SetPasswordPage', () => {
  // An expired link must explain itself, not render a form that cannot work.
  it('shows the link as spent instead of a form', async () => {
    const { el } = await render({ account: null });

    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain(text.expiredHeading);
  });

  it('words itself as a first password for an invited account', async () => {
    const { el } = await render();

    expect(el.textContent).toContain(text.setHeading);
    expect(el.textContent).toContain('jane@example.com');
  });

  it('words itself as a reset for an account that already has one', async () => {
    const { el } = await render({
      account: { purpose: 'reset', email: 'jane@example.com' },
    });

    expect(el.textContent).toContain(text.resetHeading);
  });

  it('refuses a password shorter than the contract allows', async () => {
    const { el, sync, submit, setPassword } = await render();

    setInput(el, '#newPassword', 'short');
    setInput(el, '#confirmPassword', 'short');
    submit();
    await sync();

    expect(setPassword).not.toHaveBeenCalled();
    expect(el.textContent).toContain('12');
  });

  it('refuses a confirmation that does not match', async () => {
    const { el, sync, submit, setPassword } = await render();

    setInput(el, '#newPassword', 'a long enough password');
    setInput(el, '#confirmPassword', 'a different one entirely');
    submit();
    await sync();

    expect(setPassword).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      defaultAppText.auth.validation.confirmPasswordMismatch,
    );
  });

  it('sends the token with the password and lands the signed-in user', async () => {
    const { el, sync, submit, setPassword, navigateByUrl } = await render();

    setInput(el, '#newPassword', 'a long enough password');
    setInput(el, '#confirmPassword', 'a long enough password');
    submit();
    await sync();

    expect(setPassword).toHaveBeenCalledWith({
      token: 'a-token',
      password: 'a long enough password',
    });
    expect(navigateByUrl).toHaveBeenCalled();
  });

  // The server refuses common passwords; its message is the only one that can
  // say which rule was broken, so it is shown verbatim.
  it('shows the server’s reason for refusing a password, keeping the form', async () => {
    const { el, sync, submit } = await render({
      outcome: { result: 'rejected', message: 'That is too common.' },
    });

    setInput(el, '#newPassword', 'password1234');
    setInput(el, '#confirmPassword', 'password1234');
    submit();
    await sync();

    expect(el.textContent).toContain('That is too common.');
    expect(el.querySelector('form')).not.toBeNull();
  });

  // A suggested password nobody can read is a password nobody can save.
  it('fills both fields with a generated password and reveals it', async () => {
    const { el, sync, clickText } = await render();

    clickText(text.generate);
    await sync();

    const password = el.querySelector<HTMLInputElement>('#newPassword');
    const confirm = el.querySelector<HTMLInputElement>('#confirmPassword');
    expect(password?.value.length).toBeGreaterThanOrEqual(12);
    expect(confirm?.value).toBe(password?.value);
    expect(password?.type).toBe('text');
    expect(el.textContent).toContain(text.generated);
  });

  it('toggles the password between hidden and readable', async () => {
    const { el, sync, clickText } = await render();

    expect(el.querySelector<HTMLInputElement>('#newPassword')?.type).toBe(
      'password',
    );

    clickText(text.show);
    await sync();

    expect(el.querySelector<HTMLInputElement>('#newPassword')?.type).toBe(
      'text',
    );
  });
});
