import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  AccountProfile,
  UpdateAccountProfileRequest,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AuthService } from '../auth/auth.service';
import { AccountEditPage } from './account-edit-page';
import { AccountService } from './account.service';

const text = defaultAppText.auth.myAccount.edit;
const config = defaultDeploymentConfig;

const stored: AccountProfile = {
  email: 'alex@example.com',
  role: 'user',
  firstName: 'Alex',
  lastName: 'Fischer',
  // Stored canonically: the country code the form shows as a prefix, then the
  // national part it owns, grouped by the deployment's own mask — which is
  // also what makes it *complete*, and so saveable without being retyped.
  phone: `${config.phoneInput?.countryCode}4012345678`,
  customerType: 'company',
  companyRegistrationId: '12345678',
  createdAt: '2026-02-01T10:00:00.000Z',
};

async function render(save?: (r: UpdateAccountProfileRequest) => unknown) {
  const updateProfile = vi.fn(async (request: UpdateAccountProfileRequest) => {
    save?.(request);
    return { ...stored, ...request };
  });
  const refresh = vi.fn(async () => undefined);

  TestBed.configureTestingModule({
    imports: [AccountEditPage],
    providers: [
      // A real /account route, so the redirect after a save has somewhere to go.
      provideRouter([{ path: 'account', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: AuthService, useValue: { refresh } },
      {
        provide: AccountService,
        useValue: {
          getProfile: vi.fn(async () => stored),
          updateProfile,
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AccountEditPage);
  await fixture.whenStable();
  fixture.detectChanges();
  // Twice: the first pass resolves the resource and runs the seeding effect,
  // the second renders the form the effect just filled.
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  return {
    el,
    updateProfile,
    refresh,
    field: (id: string) => el.querySelector<HTMLInputElement>(`#${id}`),
    type: (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`);
      if (!input) throw new Error(`no field ${id}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    submit: async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('AccountEditPage', () => {
  it('seeds the form from the stored record, phone without its prefix', async () => {
    const { field } = await render();

    expect(field('firstName')?.value).toBe('Alex');
    expect(field('lastName')?.value).toBe('Fischer');
    expect(field('phone')?.value).toBe('(401) 234-5678');
  });

  // The fields staff approved the account on are not on this form at all.
  it('offers no way to change the account type, company id or address', async () => {
    const { el, field } = await render();

    expect(field('customerType')).toBeNull();
    expect(field('companyRegistrationId')).toBeNull();
    expect(field('email')).toBeNull();
    expect(el.textContent).toContain(text.intro);
  });

  it('saves the canonical phone number and refreshes the greeting', async () => {
    const { type, submit, updateProfile, refresh } = await render();

    type('firstName', 'Alexa');
    await submit();

    expect(updateProfile).toHaveBeenCalledWith({
      firstName: 'Alexa',
      lastName: 'Fischer',
      phone: stored.phone,
    });
    // The greeting comes from the session, so the name change only lands there
    // once /auth/me is re-asked.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // No "saved" notice: the record it lands on is the confirmation.
  it('returns to the account once the save lands', async () => {
    const { submit } = await render();

    await submit();

    expect(TestBed.inject(Router).url).toBe('/account');
  });

  it('refuses to save an empty name, and says which field', async () => {
    const { type, submit, updateProfile, el } = await render();

    type('firstName', '');
    await submit();

    expect(updateProfile).not.toHaveBeenCalled();
    expect(el.textContent).toContain(
      defaultAppText.auth.register.validation.firstNameRequired,
    );
  });

  // An emptied phone field is a cleared number, not an unchanged one.
  it('sends null when the phone number is cleared', async () => {
    const { type, submit, updateProfile } = await render();

    type('phone', '');
    await submit();

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    );
  });

  it('reports a failed save without losing what was typed', async () => {
    const { type, submit, el, field } = await render(() => {
      throw new Error('boom');
    });

    type('firstName', 'Alexa');
    await submit();

    expect(el.textContent).toContain(text.error);
    expect(field('firstName')?.value).toBe('Alexa');
  });
});
