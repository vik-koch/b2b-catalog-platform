import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AuthService } from './auth.service';
import { RegisterPage } from './register-page';

const text = defaultAppText.auth.register;

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function check(root: HTMLElement, selector: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.click();
}

async function render(
  result: 'ok' | 'error' = 'ok',
  config = defaultDeploymentConfig,
) {
  const register = vi.fn<AuthService['register']>().mockResolvedValue(result);

  TestBed.configureTestingModule({
    imports: [RegisterPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
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

  /** Everything a private person has to give. */
  const fillPerson = async () => {
    setInput(el, '#firstName', 'Jane');
    setInput(el, '#lastName', 'Doe');
    setInput(el, '#email', 'jane@example.com');
    setInput(el, '#phone', '4012345678');
    check(el, 'input[type="checkbox"]');
    await sync();
  };

  const chooseCompany = async () => {
    check(el, 'input[value="company"]');
    await sync();
  };

  return { fixture, el, register, sync, submit, fillPerson, chooseCompany };
}

describe('RegisterPage', () => {
  it('does not submit an empty form, and says why', async () => {
    const { el, register, sync, submit } = await render();

    submit();
    await sync();

    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.firstNameRequired);
    expect(el.textContent).toContain(text.validation.lastNameRequired);
    expect(el.textContent).toContain(
      defaultAppText.auth.validation.emailRequired,
    );
    expect(el.textContent).toContain(text.validation.phoneRequired);
    expect(el.textContent).toContain(text.validation.privacyRequired);
  });

  it('rejects an address the server would reject too', async () => {
    const { el, register, sync, submit, fillPerson } = await render();

    await fillPerson();
    setInput(el, '#email', 'jane@example');
    submit();
    await sync();

    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      defaultAppText.auth.validation.emailInvalid,
    );
  });

  it('sends a private person, with the country code on the phone', async () => {
    const { register, sync, submit, fillPerson } = await render();

    await fillPerson();
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith({
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: `${defaultDeploymentConfig.phoneInput?.countryCode} (401) 234-5678`,
      customerType: 'person',
      companyRegistrationId: undefined,
      website: undefined,
    });
  });

  // The registration number is only asked of a company, and only sent by one.
  it('shows the registration number field only for a company', async () => {
    const { el, sync, chooseCompany } = await render();

    expect(el.querySelector('#companyRegistrationId')).toBeNull();

    await chooseCompany();
    expect(el.querySelector('#companyRegistrationId')).not.toBeNull();

    check(el, 'input[value="person"]');
    await sync();
    expect(el.querySelector('#companyRegistrationId')).toBeNull();
  });

  it('sends the registration number unmasked, as the server validates it', async () => {
    const { el, register, sync, submit, fillPerson, chooseCompany } =
      await render();

    await chooseCompany();
    await fillPerson();
    // The visitor types digits only: the mask groups them and the configured
    // prefix is shown beside the field, never typed. What travels is the whole
    // canonical number, prefix included — that is what the pattern describes
    // and what the shop has on file.
    setInput(el, '#companyRegistrationId', '123456789');
    await sync();
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        customerType: 'company',
        companyRegistrationId: 'DE123456789',
      }),
    );
  });

  it('refuses a number that does not match the deployment format', async () => {
    const { el, register, sync, submit, fillPerson, chooseCompany } =
      await render();

    await chooseCompany();
    await fillPerson();
    setInput(el, '#companyRegistrationId', '12345');
    await sync();
    submit();
    await sync();

    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      defaultDeploymentConfig.companyIdInput?.example ?? '',
    );
  });

  // The API answers the same for a known address, so the page must not imply
  // an account was created — only that something was sent if it could be.
  it('confirms without claiming the address was new', async () => {
    const { el, sync, submit, fillPerson } = await render();

    await fillPerson();
    submit();
    await sync();

    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain(text.successHeading);
    expect(el.textContent).toContain(text.success);
    expect(el.textContent).not.toContain('jane@example.com');
  });

  it('passes the honeypot along when a bot fills it', async () => {
    const { el, register, sync, submit, fillPerson } = await render();

    await fillPerson();
    setInput(el, '#website', 'http://spam.example');
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'http://spam.example' }),
    );
  });

  it('keeps the form and reports the failure when the request errors', async () => {
    const { el, sync, submit, fillPerson } = await render('error');

    await fillPerson();
    submit();
    await sync();

    expect(el.querySelector('form')).not.toBeNull();
    expect(el.textContent).toContain(text.error);
  });
});
