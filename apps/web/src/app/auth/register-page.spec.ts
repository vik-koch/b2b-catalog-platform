import { TestBed } from '@angular/core/testing';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { PartiesService } from '../parties/parties.service';
import { AuthService } from './auth.service';
import { RegisterPage } from './register-page';

const text = defaultAppText.auth.register;

/** What the stubbed provider answers with; set per test. */
let parties: PartySuggestion[] = [];

const kontor: PartySuggestion = {
  name: 'Kontor GmbH',
  registrationId: 'DE123456789',
  entityType: 'legal',
  address: {
    street: 'Hafenstraße',
    house: '12',
    postalCode: '20359',
    city: 'Hamburg',
    country: 'DE',
  },
};

function setInput(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function blur(root: HTMLElement, selector: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no element for ${selector}`);
  input.dispatchEvent(new Event('blur'));
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
  const suggest = vi.fn(async () => parties);

  TestBed.configureTestingModule({
    imports: [RegisterPage],
    providers: [
      provideRouter([]),
      { provide: PartiesService, useValue: { suggest } },
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

  /** Both halves of the invoiced party, which a company must give. */
  const chooseCompany = async (companyName = 'Kontor GmbH') => {
    check(el, 'input[value="company"]');
    await sync();
    setInput(el, '#companyName', companyName);
    await sync();
  };

  /**
   * Picks the first suggestion out of whichever field is asked for. Typing
   * enough to trigger the request, waiting out the debounce, then the row.
   */
  const pickCompany = async (
    field: 'companyName' | 'companyRegistrationId',
  ) => {
    setInput(el, `#${field}`, 'Kontor');
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const option = el.querySelector<HTMLElement>('[role="option"]');
    if (!option) throw new Error('no suggestion offered');
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sync();
  };

  return {
    fixture,
    el,
    register,
    suggest,
    sync,
    submit,
    fillPerson,
    chooseCompany,
    pickCompany,
  };
}

describe('RegisterPage', () => {
  beforeEach(() => {
    parties = [kontor];
  });

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

  // Half an address is unfinished, not wrong: judging it on the first letter
  // is the "scolding form" everyone hates.
  it('does not judge an address while it is still being typed', async () => {
    const { el, sync } = await render();

    setInput(el, '#email', 'j');
    await sync();

    expect(el.textContent).not.toContain(
      defaultAppText.auth.validation.emailInvalid,
    );
  });

  it('reports a malformed address once the field is left', async () => {
    const { el, sync } = await render();

    setInput(el, '#email', 'jane@example');
    blur(el, '#email');
    await sync();

    expect(el.textContent).toContain(
      defaultAppText.auth.validation.emailInvalid,
    );
  });

  // Reward the correction: the message goes on the keystroke that fixes it.
  it('clears the message as soon as the address becomes valid', async () => {
    const { el, sync } = await render();

    setInput(el, '#email', 'jane@example');
    blur(el, '#email');
    await sync();

    setInput(el, '#email', 'jane@example.com');
    await sync();

    expect(el.textContent).not.toContain(
      defaultAppText.auth.validation.emailInvalid,
    );
  });

  // Tabbing through to see what the form asks for is not a mistake.
  it('stays quiet about a required field that was only visited', async () => {
    const { el, sync } = await render();

    blur(el, '#firstName');
    await sync();

    expect(el.textContent).not.toContain(text.validation.firstNameRequired);
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
      phone: `${defaultDeploymentConfig.phoneInput?.countryCode}4012345678`,
      customerType: 'person',
      companyName: undefined,
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

  // Staff approve on both halves: the name they match against their own
  // records, the number they can check it against.
  it('asks a company for its name as well as its number', async () => {
    const { el, register, sync, submit, fillPerson, chooseCompany } =
      await render();

    await chooseCompany();
    await fillPerson();
    setInput(el, '#companyRegistrationId', 'DE123456789');
    setInput(el, '#companyName', '');
    await sync();
    submit();
    await sync();

    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.companyNameRequired);
  });

  // The contract refuses them against a private person, so switching back
  // clears them rather than leaving a stale value to be rejected.
  it('drops the company fields when the applicant is a private person', async () => {
    const { el, register, sync, submit, fillPerson, chooseCompany } =
      await render();

    await chooseCompany();
    setInput(el, '#companyRegistrationId', 'DE123456789');
    await sync();
    check(el, 'input[value="person"]');
    await sync();
    await fillPerson();
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        customerType: 'person',
        companyName: undefined,
        companyRegistrationId: undefined,
      }),
    );
  });

  it('sends the registration number as it was typed', async () => {
    const { el, register, sync, submit, fillPerson, chooseCompany } =
      await render();

    await chooseCompany();
    await fillPerson();
    // The whole number, typed as it is printed on a letterhead. Nothing is
    // prefixed for the visitor and nothing is masked away; the contract
    // normalizes what travels.
    setInput(el, '#companyRegistrationId', 'DE123456789');
    await sync();
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        customerType: 'company',
        companyName: 'Kontor GmbH',
        companyRegistrationId: 'DE123456789',
      }),
    );
  });

  // Two shapes are configured and the field asks for neither in particular:
  // whichever the customer has is measured against all of them.
  it('takes a number in any configured shape', async () => {
    const { el, register, sync, submit, fillPerson, chooseCompany } =
      await render();

    await chooseCompany();
    await fillPerson();
    setInput(el, '#companyRegistrationId', '1234567890');
    await sync();
    submit();
    await sync();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ companyRegistrationId: '1234567890' }),
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
      defaultDeploymentConfig.companyIdInput?.formats[0].example ?? '',
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

  // The mask says how many digits this deployment expects; half of them is the
  // most likely way to end up with a customer nobody can call.
  it('refuses a phone number that does not fill the mask', async () => {
    const { el, register, sync, submit, fillPerson } = await render();

    await fillPerson();
    setInput(el, '#phone', '4012');
    submit();
    await sync();

    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.validation.phoneIncomplete);
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

  describe('company suggestions (FR-AUTH-09)', () => {
    // Both fields ask the same provider, so there is no "right" one to start
    // in — which is why neither is ever disabled to steer the customer.
    it.each(['companyRegistrationId', 'companyName'] as const)(
      'fills both fields from a row picked in %s',
      async (field) => {
        const { el, sync, chooseCompany, pickCompany } = await render();

        await chooseCompany('');
        await sync();
        await pickCompany(field);

        expect(el.querySelector<HTMLInputElement>('#companyName')?.value).toBe(
          'Kontor GmbH',
        );
        expect(
          el.querySelector<HTMLInputElement>('#companyRegistrationId')?.value,
        ).toBe('DE123456789');
      },
    );

    // FR-AUTH-10: the registered address of the company they picked becomes
    // the account's first saved address.
    it('sends the picked company’s registered address', async () => {
      const { register, sync, submit, fillPerson, chooseCompany, pickCompany } =
        await render();

      await chooseCompany('');
      await fillPerson();
      await pickCompany('companyName');
      submit();
      await sync();

      expect(register.mock.calls[0][0].billingAddress).toMatchObject({
        street: 'Hafenstraße',
        house: '12',
        postalCode: '20359',
        city: 'Hamburg',
        entityType: 'legal',
      });
    });

    // An individual entrepreneur's registered address is their home. The
    // server refuses to seed one, and the form does not offer it either.
    it('marks an individual as one, so no address is seeded from it', async () => {
      parties = [{ ...kontor, entityType: 'individual' }];
      const { register, sync, submit, fillPerson, chooseCompany, pickCompany } =
        await render();

      await chooseCompany('');
      await fillPerson();
      await pickCompany('companyName');
      submit();
      await sync();

      expect(register.mock.calls[0][0].billingAddress?.entityType).toBe(
        'individual',
      );
    });

    // Picking a company and then typing a different one over it means the
    // address on file is not that company's.
    it('drops the address once the name is typed over', async () => {
      const {
        el,
        register,
        sync,
        submit,
        fillPerson,
        chooseCompany,
        pickCompany,
      } = await render();

      await chooseCompany('');
      await fillPerson();
      await pickCompany('companyName');
      setInput(el, '#companyName', 'Something Else GmbH');
      await sync();
      submit();
      await sync();

      expect(register.mock.calls[0][0].billingAddress).toBeUndefined();
    });

    // Nothing about a registration depends on a suggestion having arrived.
    it('registers a company the provider does not know', async () => {
      parties = [];
      const { el, register, sync, submit, fillPerson, chooseCompany } =
        await render();

      await chooseCompany();
      await fillPerson();
      setInput(el, '#companyRegistrationId', 'DE123456789');
      await sync();
      submit();
      await sync();

      expect(register).toHaveBeenCalledTimes(1);
      expect(register.mock.calls[0][0].billingAddress).toBeUndefined();
    });
  });
});
