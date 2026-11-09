import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Address } from '@b2b-catalog-platform/shared/core/accounts';
import { AccountProfile } from '@b2b-catalog-platform/shared/storefront/accounts';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';

import { defaultSharedAccountsText } from '../../../core/accounts/accounts-text.fixture';
import { AddressesService } from '../../../core/accounts/addresses/addresses.service';
import { plainUser } from '../../../platform/auth/auth-user.fixture';
import { AuthService } from '../../../platform/auth/auth.service';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../../platform/config/deployment-config.fixture';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { defaultSharedText } from '../../../platform/config/shared-text.fixture';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { defaultStorefrontText } from '../../../platform/config/storefront-text.fixture';
import { defaultStorefrontAccountsText } from '../accounts-text.fixture';
import { AccountPage } from './account-page';
import { AccountService } from './account.service';

const text = defaultStorefrontAccountsText.auth;
const accountText = defaultStorefrontAccountsText.account;

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
  openOrders: 0,
  phoneLocked: false,
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
  config = defaultDeploymentConfig,
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
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
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

/** An icon-only button, found by its accessible name; `template` is the text
 * line with `{label}` still in it. */
function buttonByLabel(el: HTMLElement, template: string): HTMLButtonElement {
  const prefix = template.split('{label}')[0];
  const button = [...el.querySelectorAll('button')].find((b) =>
    b.getAttribute('aria-label')?.startsWith(prefix),
  );
  if (!button) throw new Error(`no button labelled "${prefix}…"`);
  return button;
}

describe('AccountPage', () => {
  it('greets the account holder and lists what is on the account', async () => {
    const { el } = await render(customer);

    expect(el.textContent).toContain(
      defaultSharedAccountsText.signedInAs.greeting.replace(
        '{name}',
        plainUser.firstName ?? '',
      ),
    );
    expect(el.textContent).toContain('Fischer Alex');
    expect(el.textContent).toContain(customer.email);
    expect(el.textContent).toContain(customer.phone);
    expect(el.textContent).toContain(
      defaultSharedAccountsText.partyKind.company,
    );
    expect(el.textContent).toContain(customer.companyRegistrationId);
  });

  it('dates the account by the shop’s day, not the viewer’s', async () => {
    const { el } = await render(
      { ...customer, createdAt: '2026-02-01T12:00:00.000Z' },
      [],
      true,
      { ...defaultDeploymentConfig, timeZone: 'Pacific/Auckland' },
    );

    // Already the 2nd in Auckland; still the 1st in Europe and in UTC.
    expect(el.textContent).toContain(
      new Intl.DateTimeFormat(defaultDeploymentConfig.locale, {
        dateStyle: 'long',
        timeZone: 'Pacific/Auckland',
      }).format(new Date('2026-02-01T12:00:00.000Z')),
    );
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

    expect(el.textContent).not.toContain(
      defaultSharedText.fields.companyName.label,
    );
    expect(el.textContent).not.toContain(defaultSharedText.fields.phone.label);
    expect(el.textContent).not.toContain(accountText.customerType);
    expect(el.textContent).not.toContain(
      defaultSharedText.fields.companyId.label,
    );
    expect(el.textContent).toContain(defaultSharedText.fields.email.label);
  });

  describe('the address book (FR-CART-04)', () => {
    it('lists a saved address, written out on one line', async () => {
      const { el } = await render(customer, [savedAddress]);

      // The label heads the row, the invoiced company follows it in brackets,
      // and the address itself is the line underneath.
      expect(el.textContent).toContain('Shop');
      expect(el.textContent).toContain('Hafenstraße 12, 20359 Hamburg');
      // Both row actions are glyphs, so the address is their name.
      const edit = el.querySelector<HTMLAnchorElement>(
        'a[href="/account/addresses/addr-1/edit"]',
      );
      expect(edit?.getAttribute('aria-label')).toBe(
        accountText.addresses.editAria.replace('{label}', 'Shop'),
      );
      expect(edit?.textContent?.trim()).toBe('');
      expect(
        buttonByLabel(el, accountText.addresses.removeAria).getAttribute(
          'aria-label',
        ),
      ).toBe(accountText.addresses.removeAria.replace('{label}', 'Shop'));
    });

    // Unnamed, so the row is headed by its first line, which is not printed
    // twice.
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

    // One shipping country says nothing on every address; a row in another is
    // what the line is for.
    it('names a country only when it is not the deployment’s own', async () => {
      const { el } = await render(customer, [
        { ...savedAddress, city: 'Wien', country: 'AT' },
      ]);

      expect(el.textContent).toContain('AT');
    });

    it('says the book is empty rather than showing an empty list', async () => {
      const { el } = await render(customer, []);

      expect(el.textContent).toContain(accountText.addresses.empty);
    });

    it('removes an address once it is confirmed, then re-reads the list', async () => {
      const { fixture, el, h } = await render(customer, [savedAddress]);

      buttonByLabel(el, accountText.addresses.removeAria).click();
      await fixture.whenStable();

      expect(h.ask).toHaveBeenCalledTimes(1);
      expect(h.remove).toHaveBeenCalledWith('addr-1');
      expect(h.list).toHaveBeenCalledTimes(2);
    });

    it('keeps both cards on screen while the list is re-read', async () => {
      const { fixture, el, h } = await render(customer, [savedAddress]);
      h.list.mockReturnValue(new Promise<Address[]>(() => undefined));

      buttonByLabel(el, accountText.addresses.removeAria).click();
      // Not `whenStable`: the reload is held open on purpose.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(h.list).toHaveBeenCalledTimes(2);
      expect(el.textContent).toContain('Fischer Alex');
      expect(el.textContent).toContain('Shop');
    });

    it('leaves the address alone when the question is declined', async () => {
      const { fixture, el, h } = await render(customer, [savedAddress], false);

      buttonByLabel(el, accountText.addresses.removeAria).click();
      await fixture.whenStable();

      expect(h.remove).not.toHaveBeenCalled();
    });

    it('reports a book it could not load without hiding the rest', async () => {
      const { el } = await render(customer, 'reject');

      expect(el.textContent).toContain(accountText.addresses.error);
      expect(el.textContent).toContain('Fischer Alex');
    });
  });

  // FR-ACC-01, on the account page itself: the newest few, so the order
  // somebody came here to look up is on screen rather than a click away.
  // Two answers to one question, on two round trips: drawn as each lands, the
  // card grows a second time under somebody already reading the first half.
  it('holds the whole card back until both halves have answered', async () => {
    let releaseAddresses: (rows: Address[]) => void = () => undefined;
    const pending = new Promise<Address[]>((resolve) => {
      releaseAddresses = resolve;
    });

    TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [
        provideRouter([]),
        { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
        { provide: SHARED_TEXT, useValue: defaultSharedText },
        { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
        {
          provide: AuthService,
          useValue: { user: signal(plainUser), logout: vi.fn() },
        },
        { provide: AddressesService, useValue: { list: () => pending } },
        { provide: ConfirmService, useValue: { ask: vi.fn() } },
        {
          provide: AccountService,
          useValue: { getProfile: vi.fn(async () => customer) },
        },
      ],
    });

    const fixture = TestBed.createComponent(AccountPage);
    // Not `whenStable`: it waits on the resource this test is deliberately
    // holding open. A turn of the task queue is enough for the two that do
    // answer, which is the state under test.
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // The details are in hand and still off screen: the address book beside
    // them has not answered.
    expect(el.textContent).not.toContain('Fischer Alex');

    releaseAddresses([savedAddress]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('Fischer Alex');
    expect(el.textContent).toContain('Shop');
  });

  it('offers the change-password page whatever the details do', async () => {
    const { el } = await render('reject');
    const link = el.querySelector('a[href="/change-password"]');

    expect(link?.textContent).toContain(text.changePassword.heading);
    expect(el.textContent).toContain(accountText.error);
  });
});
