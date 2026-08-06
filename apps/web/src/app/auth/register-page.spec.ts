import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { AuthService } from './auth.service';
import { RegisterPage } from './register-page';

const text = defaultAppText.auth.register;

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function render(result: 'ok' | 'error' = 'ok') {
  const register = vi.fn<AuthService['register']>().mockResolvedValue(result);

  TestBed.configureTestingModule({
    imports: [RegisterPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: AuthService, useValue: { register } },
    ],
  });

  const fixture = TestBed.createComponent(RegisterPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const sync = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const submit = () =>
    el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  return { fixture, el, register, sync, submit };
}

describe('RegisterPage', () => {
  it('does not submit an empty form, and says why', async () => {
    const { el, register, sync, submit } = await render();

    submit();
    await sync();

    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      defaultAppText.auth.validation.emailRequired,
    );
  });

  it('rejects an address the server would reject too', async () => {
    const { el, register, sync, submit } = await render();

    setInput(el, '#email', 'jane@example');
    submit();
    await sync();

    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      defaultAppText.auth.validation.emailInvalid,
    );
  });

  it('sends the address and replaces the form with the confirmation', async () => {
    const { el, register, sync, submit } = await render();

    setInput(el, '#email', 'jane@example.com');
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith({
      email: 'jane@example.com',
      website: undefined,
    });
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain(text.success);
  });

  // The API answers the same for a known address, so the page must not imply
  // an account was created — only that something was sent if it could be.
  it('confirms without claiming the address was new', async () => {
    const { el, sync, submit } = await render();

    setInput(el, '#email', 'jane@example.com');
    submit();
    await sync();

    expect(el.textContent).toContain(text.successHeading);
    expect(el.textContent).not.toContain('jane@example.com');
  });

  it('passes the honeypot along when a bot fills it', async () => {
    const { el, register, sync, submit } = await render();

    setInput(el, '#email', 'bot@example.com');
    setInput(el, '#website', 'http://spam.example');
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith({
      email: 'bot@example.com',
      website: 'http://spam.example',
    });
  });

  it('keeps the form and reports the failure when the request errors', async () => {
    const { el, sync, submit } = await render('error');

    setInput(el, '#email', 'jane@example.com');
    submit();
    await sync();

    expect(el.querySelector('form')).not.toBeNull();
    expect(el.textContent).toContain(text.error);
  });
});
