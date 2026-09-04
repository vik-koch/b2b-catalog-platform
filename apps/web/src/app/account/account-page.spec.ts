import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AccountProfile,
  Address,
  OrderSummary,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AuthService } from '../auth/auth.service';
import { WorkService } from '../work/work.service';
import { workStub } from '../work/work.fixture';
import { plainUser } from '../auth/auth-user.fixture';
import { AccountPage } from './account-page';
import { AddressesService } from '../addresses/addresses.service';
import { OrdersService } from '../orders/orders.service';
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

/** One of the account's orders, as the list endpoint summarizes it. */
function order(reference: string): OrderSummary {
  return {
    reference,
    status: 'requested',
    createdAt: '2026-03-02T10:00:00.000Z',
    itemCount: 3,
    totalMinor: 12500,
    currency: 'EUR',
  };
}

interface AddressHarness {
  list: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  ask: ReturnType<typeof vi.fn>;
}

async function render(
  profile: AccountProfile | 'reject',
  addresses: Address[] | 'reject' = [],
  confirmed = true,
  orders: OrderSummary[] | 'reject' = [],
  waiting = 0,
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
      { provide: WorkService, useValue: workStub({ myOrders: waiting }) },
      { provide: AddressesService, useValue: h },
      {
        provide: OrdersService,
        useValue: {
          listMine: vi.fn(() =>
            orders === 'reject'
              ? Promise.reject(new Error('500'))
              : Promise.resolve({
                  items: orders,
                  pagination: {
                    page: 1,
                    pageSize: 10,
                    total: orders.length,
                    totalPages: 1,
                  },
                }),
          ),
        },
      },
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

/** An icon-only button, found by the accessible name it carries instead of
 * text — `template` is the app-text line with `{label}` still in it. */
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
      // Both row actions are glyphs, so the address is their name.
      const edit = el.querySelector<HTMLAnchorElement>(
        'a[href="/account/addresses/addr-1/edit"]',
      );
      expect(edit?.getAttribute('aria-label')).toBe(
        text.myAccount.addresses.editLabel.replace('{label}', 'Shop'),
      );
      expect(edit?.textContent?.trim()).toBe('');
      expect(
        buttonByLabel(el, text.myAccount.addresses.removeLabel).getAttribute(
          'aria-label',
        ),
      ).toBe(text.myAccount.addresses.removeLabel.replace('{label}', 'Shop'));
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

      buttonByLabel(el, text.myAccount.addresses.removeLabel).click();
      await fixture.whenStable();

      expect(h.ask).toHaveBeenCalledTimes(1);
      expect(h.remove).toHaveBeenCalledWith('addr-1');
      expect(h.list).toHaveBeenCalledTimes(2);
    });

    it('leaves the address alone when the question is declined', async () => {
      const { fixture, el, h } = await render(customer, [savedAddress], false);

      buttonByLabel(el, text.myAccount.addresses.removeLabel).click();
      await fixture.whenStable();

      expect(h.remove).not.toHaveBeenCalled();
    });

    it('reports a book it could not load without hiding the rest', async () => {
      const { el } = await render(customer, 'reject');

      expect(el.textContent).toContain(text.myAccount.addresses.error);
      expect(el.textContent).toContain('Alex Fischer');
    });
  });

  // FR-ACC-01, on the account page itself: the newest few, so the order
  // somebody came here to look up is on screen rather than a click away.
  describe('the recent orders', () => {
    it('lists the newest orders and links each of them', async () => {
      const { el } = await render(customer, [], true, [
        order('CK-2026-0002'),
        order('CK-2026-0001'),
      ]);

      expect(el.textContent).toContain('CK-2026-0002');
      expect(
        el.querySelector('a[href="/account/orders/CK-2026-0002"]'),
      ).not.toBeNull();
    });

    // Five on the card; the sixth is what the history page is for.
    it('shows at most five, and offers the rest only when there are more', async () => {
      const many = Array.from({ length: 6 }, (_, i) =>
        order(`CK-2026-000${i + 1}`),
      );
      const { el } = await render(customer, [], true, many);

      expect(el.querySelectorAll('a[href^="/account/orders/"]')).toHaveLength(
        5,
      );
      expect(el.querySelector('a[href="/account/orders"]')).not.toBeNull();
    });

    // A button that opens the same five rows on another page is a click that
    // changes nothing.
    it('offers no history page when the card is already the whole of it', async () => {
      const { el } = await render(customer, [], true, [order('CK-2026-0001')]);

      expect(el.querySelector('a[href="/account/orders"]')).toBeNull();
    });

    it('says there are none yet, and where to start', async () => {
      const { el } = await render(customer, [], true, []);

      expect(el.textContent).toContain(defaultAppText.orders.empty);
      expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
    });

    it('reports orders it could not load without hiding the rest', async () => {
      const { el } = await render(customer, [], true, 'reject');

      expect(el.textContent).toContain(defaultAppText.orders.error);
      expect(el.textContent).toContain('Alex Fischer');
    });

    /*
     * What waits on the customer (FR-WORK-03), above the rows it is about —
     * the other end of the marker on the account control. Silent until order
     * processing gives an order a state that waits on them, which is why the
     * count is stubbed rather than seeded.
     */
    it('says what is waiting on the account holder, and links to it', async () => {
      const { el } = await render(
        customer,
        [],
        true,
        [order('CK-2026-0001')],
        2,
      );

      const note = el.querySelector('app-work-note a');
      expect(note?.textContent).toContain('2 waiting for you');
      expect(note?.getAttribute('href')).toBe('/account/orders');
    });

    it('says nothing when nothing waits on them', async () => {
      const { el } = await render(customer, [], true, [order('CK-2026-0001')]);

      expect(el.querySelector('app-work-note')).toBeNull();
    });
  });

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
        { provide: APP_TEXT, useValue: defaultAppText },
        { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
        {
          provide: AuthService,
          useValue: { user: signal(plainUser), logout: vi.fn() },
        },
        { provide: WorkService, useValue: workStub() },
        { provide: AddressesService, useValue: { list: () => pending } },
        { provide: ConfirmService, useValue: { ask: vi.fn() } },
        {
          provide: AccountService,
          useValue: { getProfile: vi.fn(async () => customer) },
        },
        {
          provide: OrdersService,
          useValue: {
            listMine: vi.fn(async () => ({
              items: [],
              pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
            })),
          },
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
    expect(el.textContent).not.toContain('Alex Fischer');

    releaseAddresses([savedAddress]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('Alex Fischer');
    expect(el.textContent).toContain('Shop');
  });

  it('offers the change-password page whatever the details do', async () => {
    const { el } = await render('reject');
    const link = el.querySelector('a[href="/change-password"]');

    expect(link?.textContent).toContain(text.changePassword.heading);
    expect(el.textContent).toContain(text.myAccount.error);
  });
});
