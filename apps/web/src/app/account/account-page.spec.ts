import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountProfile } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AuthService } from '../auth/auth.service';
import { plainUser } from '../auth/auth-user.fixture';
import { AccountPage } from './account-page';
import { AccountService } from './account.service';

const text = defaultAppText.auth;

const customer: AccountProfile = {
  email: 'alex@example.com',
  role: 'user',
  firstName: 'Alex',
  lastName: 'Fischer',
  phone: '+49 40 1234567',
  customerType: 'company',
  companyRegistrationId: '12345678',
  createdAt: '2026-02-01T10:00:00.000Z',
};

async function render(profile: AccountProfile | 'reject') {
  TestBed.configureTestingModule({
    imports: [AccountPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      {
        provide: AuthService,
        useValue: { user: signal(plainUser), logout: vi.fn() },
      },
      {
        provide: AccountService,
        useValue: {
          getProfile: vi.fn(() =>
            profile === 'reject'
              ? Promise.reject(new Error('500'))
              : Promise.resolve(profile),
          ),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AccountPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AccountPage', () => {
  it('greets the account holder and lists what is on the account', async () => {
    const el = await render(customer);

    expect(el.textContent).toContain(
      text.greeting.replace('{name}', plainUser.firstName ?? ''),
    );
    expect(el.textContent).toContain('Alex Fischer');
    expect(el.textContent).toContain(customer.email);
    expect(el.textContent).toContain(customer.phone);
    expect(el.textContent).toContain(text.myAccount.company);
    expect(el.textContent).toContain(customer.companyRegistrationId);
  });

  // Absent, not empty: a staff account has no phone and no registration
  // number, and a column of dashes reads as data that failed to load.
  it('omits the lines this account has nothing for', async () => {
    const el = await render({
      ...customer,
      role: 'manager',
      phone: null,
      customerType: null,
      companyRegistrationId: null,
    });

    expect(el.textContent).not.toContain(text.myAccount.phone);
    expect(el.textContent).not.toContain(text.myAccount.customerType);
    expect(el.textContent).not.toContain(text.myAccount.companyId);
    expect(el.textContent).toContain(text.myAccount.email);
  });

  it('offers the change-password page whatever the details do', async () => {
    const el = await render('reject');
    const link = el.querySelector('a[href="/change-password"]');

    expect(link?.textContent).toContain(text.changePassword.heading);
    expect(el.textContent).toContain(text.myAccount.error);
  });
});
