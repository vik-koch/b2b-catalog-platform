import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccountProfile, Address } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AuthService } from '../auth/auth.service';
import { plainUser } from '../auth/auth-user.fixture';
import { AccountPage } from './account-page';
import { AddressesService } from '../addresses/addresses.service';
import { ConfirmService } from '../ui/confirm.service';
import { AccountService } from './account.service';

const text = defaultAppText.auth;

const customer: AccountProfile = {
  email: 'alex@example.com',
  role: 'user',
  firstName: 'Alex',
  lastName: 'Fischer',
  phone: '+49 40 1234567',
  customerType: 'company',
  companyName: 'Kontor GmbH',
  companyRegistrationId: '12345678',
  createdAt: '2026-02-01T10:00:00.000Z',
};

const savedAddress: Address = {
  id: 'addr-1',
  label: 'Shop',
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
};

interface AddressHarness {
  list: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  ask: ReturnType<typeof vi.fn>;
}

async function render(
  profile: AccountProfile | 'reject',
  addresses: Address[] | 'reject' = [],
  confirmed = true,
) {
  const h: AddressHarness = {
    list: vi.fn(() =>
      addresses === 'reject'
        ? Promise.reject(new Error('500'))
        : Promise.resolve(addresses),
    ),
    remove: vi.fn(() => Promise.resolve()),
    ask: vi.fn(() => Promise.resolve(confirmed)),
  };

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
      { provide: AddressesService, useValue: h },
      { provide: ConfirmService, useValue: { ask: h.ask } },
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
  return { fixture, el: fixture.nativeElement as HTMLElement, h };
}

function buttonByText(el: HTMLElement, label: string): HTMLButtonElement {
  const button = [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button labelled "${label}"`);
  return button;
}

describe('AccountPage', () => {
  it('greets the account holder and lists what is on the account', async () => {
    const { el } = await render(customer);

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
    const { el } = await render({
      ...customer,
      role: 'manager',
      phone: null,
      customerType: null,
      companyName: null,
      companyRegistrationId: null,
    });

    expect(el.textContent).not.toContain(text.myAccount.companyName);
    expect(el.textContent).not.toContain(text.myAccount.phone);
    expect(el.textContent).not.toContain(text.myAccount.customerType);
    expect(el.textContent).not.toContain(text.myAccount.companyId);
    expect(el.textContent).toContain(text.myAccount.email);
  });

  describe('the address book (FR-CART-04)', () => {
    it('lists a saved address, written out on one line', async () => {
      const { el } = await render(customer, [savedAddress]);

      // The label heads the row, the invoiced company follows it in brackets,
      // and the address itself is the line underneath.
      expect(el.textContent).toContain('Shop');
      expect(el.textContent).toContain('Hafenstraße 12, 20359 Hamburg');
      expect(
        el.querySelector('a[href="/account/addresses/addr-1/edit"]'),
      ).not.toBeNull();
    });

    // Nothing was named at checkout, so the row is headed by its own first
    // line — and that line is not then printed twice.
    it('names an unlabelled address by its first line', async () => {
      const { el } = await render(customer, [{ ...savedAddress, label: null }]);

      expect(el.textContent).toContain('Hafenstraße 12');
      expect(el.textContent).toContain('20359 Hamburg');
      expect(el.textContent).not.toContain('Hafenstraße 12, 20359');
    });

    // The street identifies the place and the office inside it is part of that;
    // the invoiced company follows in brackets, never printed twice.
    it('names an unlabelled address by its street and what is on line 2', async () => {
      const { el } = await render(customer, [
        { ...savedAddress, label: null, street2: 'Büro 505' },
      ]);

      expect(el.textContent).toContain('Hafenstraße 12, Büro 505');
      expect(el.textContent).toContain('20359 Hamburg');
    });

    // The deployment ships to one country, so printing it on every address
    // says nothing — but a row in another one is exactly what the line is for.
    it('names a country only when it is not the deployment’s own', async () => {
      const { el } = await render(customer, [
        { ...savedAddress, city: 'Wien', country: 'AT' },
      ]);

      expect(el.textContent).toContain('AT');
    });

    it('says the book is empty rather than showing an empty list', async () => {
      const { el } = await render(customer, []);

      expect(el.textContent).toContain(text.myAccount.addresses.empty);
    });

    it('removes an address once it is confirmed, then re-reads the list', async () => {
      const { fixture, el, h } = await render(customer, [savedAddress]);

      buttonByText(el, text.myAccount.addresses.remove).click();
      await fixture.whenStable();

      expect(h.ask).toHaveBeenCalledTimes(1);
      expect(h.remove).toHaveBeenCalledWith('addr-1');
      expect(h.list).toHaveBeenCalledTimes(2);
    });

    it('leaves the address alone when the question is declined', async () => {
      const { fixture, el, h } = await render(customer, [savedAddress], false);

      buttonByText(el, text.myAccount.addresses.remove).click();
      await fixture.whenStable();

      expect(h.remove).not.toHaveBeenCalled();
    });

    it('reports a book it could not load without hiding the rest', async () => {
      const { el } = await render(customer, 'reject');

      expect(el.textContent).toContain(text.myAccount.addresses.error);
      expect(el.textContent).toContain('Alex Fischer');
    });
  });

  it('offers the change-password page whatever the details do', async () => {
    const { el } = await render('reject');
    const link = el.querySelector('a[href="/change-password"]');

    expect(link?.textContent).toContain(text.changePassword.heading);
    expect(el.textContent).toContain(text.myAccount.error);
  });
});
