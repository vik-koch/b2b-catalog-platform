import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Address, OrderSubmission } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { DeploymentConfig } from '../config/deployment-config.type';
import { SUGGESTIONS_ENABLED } from '../config/suggestions-enabled';
import { AccountService } from '../account/account.service';
import { AuthService } from '../auth/auth.service';
import { AddressesService } from '../addresses/addresses.service';
import { packagedPackaging } from '../catalog/product.fixture';
import { CartAddition, CartService } from '../cart/cart.service';
import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_DRAFT_VERSION,
  CheckoutDraftService,
  emptyDraft,
} from './checkout-draft.service';
import { CheckoutPage } from './checkout-page';
import { OrdersService, SubmitOrderResult } from '../orders/orders.service';

const text = defaultAppText.checkout;

function addition(): CartAddition {
  return {
    slug: 'filter-roast',
    name: 'Filter Roast',
    unit: 'pack',
    pieces: 12,
    note: null,
    image: null,
    lineNoteEnabled: false,
    lineNotePrompt: null,
    prices: {
      pieceMilliMinor: 1_166_667,
      pieceLotMinor: 7000,
      pack: 7000,
      box: 28_000,
    },
    packaging: { ...packagedPackaging },
  };
}

/** In the demo's `city` zone (postal prefix 20), which is free from €150. */
const saved: Address = {
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

interface Options {
  config?: DeploymentConfig;
  addresses?: Address[];
  /** A person rather than a company, for how the party row names them. */
  person?: boolean;
  /** Overrides the company name the profile carries, whatever its type. */
  companyName?: string;
  /** Whether the cart has anything in it. */
  empty?: boolean;
  /** Whether the deployment has a suggestion provider behind it — the
   * environment's answer, not the config's. */
  suggests?: boolean;
  /** What placing the order comes to. Accepted unless a test says otherwise. */
  submit?: SubmitOrderResult;
  /** No session at all (FR-CART-03). */
  guest?: boolean;
  /** An account whose record carries no telephone number — which staff can
   * create, and which the order contract will not accept. */
  noPhone?: boolean;
  /** The session's role. Staff do not buy; everything else assumes a customer. */
  role?: 'user' | 'manager' | 'admin';
}

/** Every submission the page sent, and what it was answered with. */
let sent: OrderSubmission[] = [];
let submitted = vi.fn();

async function render(options: Options = {}) {
  sent = [];
  submitted = vi.fn(async (order: OrderSubmission) => {
    sent.push(order);
    return (
      options.submit ?? {
        ok: true,
        reference: 'CK-260827-0042',
        publicToken: 'token',
      }
    );
  });

  TestBed.configureTestingModule({
    imports: [CheckoutPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: options.config ?? defaultDeploymentConfig,
      },
      { provide: SUGGESTIONS_ENABLED, useValue: options.suggests ?? false },
      {
        provide: AuthService,
        useValue: {
          // Resolved either way: the page waits for a real answer before it
          // draws a form, because the two shapes ask different questions.
          resolved: signal(true),
          user: signal(
            options.guest
              ? null
              : {
                  id: 'user-1',
                  email: 'alex@example.com',
                  role: options.role ?? 'user',
                },
          ),
        },
      },
      {
        provide: OrdersService,
        useValue: {
          submit: submitted,
        },
      },
      {
        provide: AddressesService,
        useValue: {
          list: vi.fn(async () => options.addresses ?? [saved]),
          suggest: vi.fn(async () => []),
        },
      },
      {
        provide: AccountService,
        useValue: {
          getProfile: vi.fn(async () => ({
            email: 'alex@example.com',
            role: 'user',
            firstName: 'Alex',
            lastName: 'Fischer',
            phone: options.noPhone ? null : '+494012345678',
            customerType: options.person ? 'person' : 'company',
            companyName:
              options.companyName ?? (options.person ? null : 'Kontor GmbH'),
            companyRegistrationId: options.person ? null : 'DE123456789',
            createdAt: '2026-02-01T10:00:00.000Z',
          })),
        },
      },
    ],
  });

  if (!options.empty) TestBed.inject(CartService).add(addition());

  const fixture = TestBed.createComponent(CheckoutPage);
  // What the router outlet would do: the step is a query parameter, and in a
  // test nothing binds one. Driving the input from the navigation keeps the
  // two screens moving the way they do in a browser.
  vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(
    async (_commands, extras) => {
      const step = extras?.queryParams?.['step'] ?? undefined;
      fixture.componentRef.setInput('step', step ?? undefined);
      return true;
    },
  );
  // Twice: the first pass resolves the book and the profile, the second
  // renders what they seeded.
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;

  return {
    fixture,
    drafts: TestBed.inject(CheckoutDraftService),
    el,
    /** Types into a field the way a customer does, so the form's own
     * subscriptions run. Both events, because a field takes whichever it
     * needs — a date is committed on change, a note as it is written. */
    type: (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`No ${selector} on the page`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
    },
    value: (selector: string) =>
      el.querySelector<HTMLInputElement>(selector)?.value,
    /** Leaves the field, which is when the delivery zone is re-read. */
    blur: (selector: string) => {
      el.querySelector(selector)?.dispatchEvent(
        new Event('focusout', { bubbles: true }),
      );
    },
    button: (label: string) =>
      Array.from(el.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === label,
      ),
    /** Through the form's own button on to the read-back. */
    review: async () => {
      Array.from(el.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === text.review.send)
        ?.click();
      await fixture.whenStable();
      fixture.detectChanges();
    },
    /** Picks an option through its radio, which is what the page listens to. */
    pick: (group: string, value: string) => {
      const radio = el.querySelector<HTMLInputElement>(
        `input[name="${group}"][value="${value}"]`,
      );
      if (!radio) throw new Error(`No ${value} option in ${group}`);
      radio.click();
    },
    radio: (group: string, value: string) =>
      el.querySelector<HTMLInputElement>(
        `input[name="${group}"][value="${value}"]`,
      ),
    text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
    settle: async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

/** A deployment that invoices no address of its own (FR-CART-07). */
const noBillingAddress: DeploymentConfig = {
  ...defaultDeploymentConfig,
  billingAddressEnabled: false,
};

function withPickupPoints(count: number): DeploymentConfig {
  const locations = (defaultDeploymentConfig.pickup?.locations ?? []).slice(
    0,
    count,
  );
  return {
    ...defaultDeploymentConfig,
    pickup: locations.length ? { locations } : undefined,
  };
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('fulfilment', () => {
    it('has nothing to order with an empty cart', async () => {
      const page = await render({ empty: true });

      expect(page.text()).toContain(text.emptyCart);
      expect(page.text()).not.toContain(text.fulfilment.heading);
    });

    it('asks for a collection point only once pickup is chosen', async () => {
      const page = await render();

      expect(page.text()).toContain(text.fulfilment.deliveryTitle);
      expect(page.text()).not.toContain(text.fulfilment.pickupHeading);

      page.drafts.patch({ fulfilmentMethod: 'pickup' });
      await page.settle();

      expect(page.text()).toContain(text.fulfilment.pickupHeading);
      for (const point of defaultDeploymentConfig.pickup?.locations ?? []) {
        expect(page.text()).toContain(point.name);
        expect(page.text()).toContain(point.address);
      }
    });

    // A list of one is not a question — and the draft may arrive on pickup from
    // a previous visit, never passing through the fulfilment click.
    it('answers a single collection point itself, however pickup was reached', async () => {
      const only = withPickupPoints(1);
      const key = only.pickup?.locations[0].key;

      const clicked = await render({ config: only });
      clicked.pick('fulfilment', 'pickup');
      await clicked.settle();
      expect(clicked.drafts.draft().pickupLocationKey).toBe(key);

      TestBed.resetTestingModule();
      sessionStorage.setItem(
        CHECKOUT_DRAFT_KEY,
        JSON.stringify({
          version: CHECKOUT_DRAFT_VERSION,
          draft: { ...emptyDraft(), fulfilmentMethod: 'pickup' },
        }),
      );
      const restored = await render({ config: only });
      expect(restored.drafts.draft().pickupLocationKey).toBe(key);
    });

    // Two points is a real question, so nothing is chosen for the customer —
    // which makes saying so on refusal the whole of the feedback they get.
    it('says which answer is missing when several points go unchosen', async () => {
      const page = await render();

      page.drafts.patch({ fulfilmentMethod: 'pickup' });
      await page.settle();
      expect(page.drafts.draft().pickupLocationKey).toBeNull();
      expect(page.text()).not.toContain(text.fulfilment.pickupRequired);

      await page.review();

      expect(page.text()).toContain(text.errors.incomplete);
      // The generic error says the form is marked; this is that marking.
      expect(page.text()).toContain(text.fulfilment.pickupRequired);
    });

    it('takes the message back once a point is chosen', async () => {
      const page = await render();
      const key = defaultDeploymentConfig.pickup?.locations[0].key ?? '';

      page.drafts.patch({ fulfilmentMethod: 'pickup' });
      await page.settle();
      await page.review();
      expect(page.text()).toContain(text.fulfilment.pickupRequired);

      page.drafts.patch({ pickupLocationKey: key });
      await page.settle();

      expect(page.text()).not.toContain(text.fulfilment.pickupRequired);
    });

    it('offers no pickup where the deployment has no collection points', async () => {
      const page = await render({ config: withPickupPoints(0) });

      expect(page.text()).toContain(text.fulfilment.deliveryTitle);
      expect(page.text()).not.toContain(text.fulfilment.pickupTitle);
    });
  });

  describe('the party being invoiced', () => {
    it('names the account by its company', async () => {
      const page = await render();

      expect(page.text()).toContain('Kontor GmbH');
      expect(page.text()).toContain(text.party.other);
      expect(page.text()).not.toContain(text.party.otherNotice);
    });

    it('names a private customer by their own name', async () => {
      const page = await render({ person: true });

      expect(page.text()).toContain('Alex Fischer');
    });

    it('names them by the type they registered as, not by what is filled in', async () => {
      // A private customer who once gave a company name is still invoiced by
      // name: the type is the answer, not whichever field is not empty.
      const page = await render({ person: true, companyName: 'Kontor GmbH' });

      expect(page.text()).toContain('Alex Fischer');
      expect(page.text()).not.toContain('Kontor GmbH');
    });

    it('asks a person for a name alone', async () => {
      const page = await render();

      page.drafts.patch({ party: 'person' });
      await page.settle();

      expect(page.text()).toContain(text.party.otherNotice);
      expect(page.el.querySelector('#party-personName')).not.toBeNull();
      // No registration number: a private party has none, and an optional
      // field beside a required one asked neither question clearly.
      expect(page.el.querySelector('#party-companyId')).toBeNull();
    });

    it('asks a company for a name and a number, both required', async () => {
      const page = await render();

      page.drafts.patch({ party: 'company' });
      await page.settle();

      expect(page.el.querySelector('#party-companyName')).not.toBeNull();
      expect(page.el.querySelector('#party-companyId')).not.toBeNull();
    });

    it('keeps the kind of party chosen when the option is left and returned to', async () => {
      const page = await render();

      page.pick('party', 'other');
      await page.settle();
      page.pick('party-kind', 'company');
      await page.settle();
      expect(page.drafts.draft().party).toBe('company');

      page.pick('party', 'account');
      await page.settle();
      page.pick('party', 'other');
      await page.settle();

      // Back on the company half, not reset to the first of the two.
      expect(page.drafts.draft().party).toBe('company');
      expect(page.el.querySelector('#party-companyId')).not.toBeNull();
    });

    it('does not carry a person’s name into the company field', async () => {
      const page = await render();

      page.drafts.patch({ party: 'person' });
      await page.settle();
      page.type('#party-personName', 'Alex Fischer');
      expect(page.drafts.draft().otherPartyName).toBe('Alex Fischer');

      page.pick('party-kind', 'company');
      await page.settle();

      expect(page.value('#party-companyName')).toBe('');
      expect(page.drafts.draft().otherPartyName).toBeNull();
    });
  });

  describe('addresses', () => {
    it('offers the book and starts on its first row', async () => {
      const page = await render();

      expect(page.text()).toContain(text.addresses.deliveryHeading);
      expect(page.text()).toContain('Shop');
      expect(page.drafts.draft().deliveryAddressId).toBe(saved.id);
    });

    it('reveals the fields for an address that is not in the book', async () => {
      const page = await render();

      page.drafts.patch({ deliveryAddressId: null });
      await page.settle();

      expect(
        page.el.querySelector('input[autocomplete="street-address"]'),
      ).not.toBeNull();
      expect(page.text()).toContain(text.addresses.saveToBook);
    });

    it('asks for the street alone where a provider can fill the rest', async () => {
      const page = await render({ suggests: true });

      page.drafts.patch({ deliveryAddressId: null });
      await page.settle();

      expect(
        page.el.querySelector('input[autocomplete="street-address"]'),
      ).not.toBeNull();
      expect(page.el.querySelector('[id$="-postalCode"]')).toBeNull();
      // The way out is on screen from the start, not after a provider fails.
      expect(page.text()).toContain(
        defaultAppText.auth.myAccount.addresses.enterManually,
      );
    });

    it('reads back the parts the street line does not say', async () => {
      // An address already in the draft is the same case a picked suggestion
      // leaves behind: the folded-away fields are filled, and the customer is
      // the only one who can say they are wrong.
      sessionStorage.setItem(
        CHECKOUT_DRAFT_KEY,
        JSON.stringify({
          version: CHECKOUT_DRAFT_VERSION,
          draft: {
            ...emptyDraft(),
            newDeliveryAddress: {
              label: null,
              street: 'Hafenstraße 12',
              street2: null,
              postalCode: '20359',
              city: 'Hamburg',
              region: null,
              country: 'DE',
            },
          },
        }),
      );
      const page = await render({ suggests: true, addresses: [] });

      expect(page.el.querySelector('[id$="-postalCode"]')).toBeNull();
      expect(page.text()).toContain('20359 Hamburg');
    });

    it('opens the rest when the street was typed and nothing resolved', async () => {
      const page = await render({ suggests: true, addresses: [] });

      expect(page.el.querySelector('[id$="-postalCode"]')).toBeNull();

      page.type('input[autocomplete="street-address"]', 'Hafenstraße 12');
      page.blur('input[autocomplete="street-address"]');
      await page.settle();

      // No postcode behind the street line, so the fields it was folding away
      // are the ones the customer now has to fill.
      expect(page.el.querySelector('[id$="-postalCode"]')).not.toBeNull();
    });

    it('opens the rest when the order is sent with the address unfinished', async () => {
      const page = await render({ suggests: true, addresses: [] });

      await page.review();

      expect(page.el.querySelector('[id$="-postalCode"]')).not.toBeNull();
      expect(page.text()).toContain(text.errors.incomplete);
    });

    it('asks for every field where there is no provider', async () => {
      const page = await render();

      page.drafts.patch({ deliveryAddressId: null });
      await page.settle();

      expect(page.el.querySelector('[id$="-postalCode"]')).not.toBeNull();
      expect(page.text()).not.toContain(
        defaultAppText.auth.myAccount.addresses.enterManually,
      );
    });

    it('asks for a billing address only once it differs from delivery', async () => {
      const page = await render();

      expect(page.text()).toContain(text.addresses.sameAsDelivery);
      expect(page.text()).not.toContain(text.addresses.billingHeading);

      page.drafts.patch({ billingSameAsDelivery: false });
      await page.settle();

      expect(page.text()).toContain(text.addresses.billingHeading);
    });

    it('asks for a billing address on pickup, and no delivery one', async () => {
      const page = await render();

      page.drafts.patch({ fulfilmentMethod: 'pickup' });
      await page.settle();

      expect(page.text()).toContain(text.addresses.billingOnlyHeading);
      expect(page.text()).not.toContain(text.addresses.deliveryHeading);
    });

    // FR-CART-07: where a deployment invoices no address of its own, a
    // delivery gives the one address it needs and a collected order none.
    it('offers no invoice address where the deployment invoices none', async () => {
      const page = await render({ config: noBillingAddress });

      expect(page.text()).toContain(text.addresses.deliveryHeading);
      expect(page.text()).not.toContain(text.addresses.sameAsDelivery);
      expect(page.text()).not.toContain(text.addresses.billingHeading);
    });

    it('asks a collected order for no address at all', async () => {
      const page = await render({ config: noBillingAddress });

      page.drafts.patch({ fulfilmentMethod: 'pickup' });
      await page.settle();

      expect(page.text()).not.toContain(text.addresses.billingOnlyHeading);
      expect(page.text()).not.toContain(text.addresses.deliveryHeading);
      expect(page.el.querySelector('[id$="-postalCode"]')).toBeNull();
    });

    it('sends no invoice address, and says nothing about one', async () => {
      const page = await render({ config: noBillingAddress });

      await page.review();
      expect(page.text()).not.toContain(text.review.billingSame);

      page.el.querySelector<HTMLInputElement>('#accept-privacy')?.click();
      await page.settle();
      page.button(text.submit)?.click();
      await page.settle();

      expect(sent).toHaveLength(1);
      expect(sent[0].billingAddress).toBeNull();
      expect(sent[0].deliveryAddress).toMatchObject({ postalCode: '20359' });
    });

    it('is the fields alone where there is nothing saved to choose from', async () => {
      const page = await render({ addresses: [] });

      // No list, so no option to tick and nothing to say about an empty book.
      expect(page.text()).not.toContain(text.addresses.addNew);
      expect(page.el.querySelector('[id$="-postalCode"]')).not.toBeNull();
      expect(page.drafts.draft().deliveryAddressId).toBeNull();
    });
  });

  describe('when it is wanted, how it is paid and anything else', () => {
    it('asks for a date in the words of the chosen fulfilment', async () => {
      const page = await render();

      expect(page.text()).toContain(text.timing.deliveryLabel);

      page.drafts.patch({ fulfilmentMethod: 'pickup' });
      await page.settle();

      expect(page.text()).toContain(text.timing.pickupLabel);
      expect(page.text()).not.toContain(text.timing.deliveryLabel);
    });

    it('keeps the wished date and the note in the draft', async () => {
      const page = await render();

      page.type('#preferred-date', '2026-09-03');
      page.type('#order-note', 'Ring the bell at the back gate.');

      expect(page.drafts.draft().preferredDate).toBe('2026-09-03');
      expect(page.drafts.draft().customerNote).toBe(
        'Ring the bell at the back gate.',
      );
    });

    it('says when cash is handed over, in the words of the fulfilment', async () => {
      const page = await render();

      expect(page.text()).toContain(text.payment.cashDeliveryDescription);

      page.drafts.patch({ fulfilmentMethod: 'pickup' });
      await page.settle();

      expect(page.text()).toContain(text.payment.cashPickupDescription);
    });

    it('offers cash and bank transfer, and never card', async () => {
      const page = await render();

      expect(page.text()).toContain(text.payment.cashTitle);
      expect(page.text()).toContain(text.payment.transferTitle);
      expect(page.radio('payment', 'card-later')).toBeNull();
      expect(page.drafts.draft().paymentMethod).toBe('cash');
    });

    it('lets a company account pay by transfer', async () => {
      const page = await render();

      expect(page.radio('payment', 'bank-transfer')?.disabled).toBe(false);

      page.pick('payment', 'bank-transfer');
      await page.settle();

      expect(page.drafts.draft().paymentMethod).toBe('bank-transfer');
    });

    it('says why a private customer cannot, rather than hiding it', async () => {
      const page = await render({ person: true });

      expect(page.radio('payment', 'bank-transfer')?.disabled).toBe(true);
      expect(page.text()).toContain(text.payment.transferCompanyOnly);
      expect(page.text()).not.toContain(text.payment.transferDescription);
    });

    it('falls back to cash when the party stops being a company', async () => {
      const page = await render();

      page.pick('payment', 'bank-transfer');
      await page.settle();
      expect(page.drafts.draft().paymentMethod).toBe('bank-transfer');

      page.pick('party', 'other');
      await page.settle();

      expect(page.drafts.draft().paymentMethod).toBe('cash');
    });
  });

  describe('the delivery area', () => {
    it('names the zone the chosen address falls in, and what it needs to be free', async () => {
      const page = await render();

      // Hamburg 20359 is the demo's city zone, free from €150; the cart holds
      // two packs at €70.
      expect(page.text()).toContain('Hamburg city');
      expect(page.text()).toContain(
        text.zone.shortOf.replace('{amount}', '10,00 €'),
      );
    });

    it('says nothing at all before there is a postcode to resolve on', async () => {
      const page = await render({ addresses: [] });

      expect(page.text()).not.toContain('Hamburg city');
      expect(page.text()).not.toContain(text.zone.unknown);
    });

    it('waits for the field to be left before resolving anything', async () => {
      const page = await render({ addresses: [] });

      page.type('[id$="-postalCode"]', '20359');
      await page.settle();
      // Half a postcode resolves to whatever zone starts with those digits;
      // the hint says nothing until the customer has finished with the field.
      expect(page.text()).not.toContain('Hamburg city');

      page.blur('[id$="-postalCode"]');
      await page.settle();

      expect(page.text()).toContain('Hamburg city');
    });

    it('says so where the deployment does not deliver', async () => {
      const page = await render({ addresses: [] });

      // 99999 falls past every configured range into the demo's catch-all,
      // which is an area it does not drive to.
      page.type('[id$="-postalCode"]', '99999');
      page.blur('[id$="-postalCode"]');
      await page.settle();

      expect(page.text()).toContain(text.zone.noDelivery);
    });
  });

  describe('a guest (FR-CART-03)', () => {
    it('asks for the contact details an account would have answered', async () => {
      const page = await render({ guest: true });

      expect(page.text()).toContain(text.contact.heading);
      expect(page.el.querySelector('#contact-name')).not.toBeNull();
      // The party and the contact are one answer for a private person, so the
      // name is asked once and there is no second field for it.
      expect(page.el.querySelector('#party-personName')).toBeNull();
      expect(page.el.querySelector('#contact-email')).not.toBeNull();
      expect(page.el.querySelector('#contact-phone')).not.toBeNull();
    });

    it('offers signing in rather than demanding it', async () => {
      const page = await render({ guest: true });

      expect(page.text()).toContain(text.signInPrompt);
      // The form is right there — the offer is beside it, not in front of it.
      expect(page.text()).toContain(text.fulfilment.heading);
    });

    it('never asks a guest which of their accounts to invoice', async () => {
      const page = await render({ guest: true });

      // No account, so no first option and no list: only the kind of party.
      expect(page.radio('party', 'account')).toBeNull();
      expect(page.radio('party-kind', 'person')).not.toBeNull();
      expect(page.drafts.draft().party).toBe('person');
      // And no agreed prices to be told this order is not getting.
      expect(page.text()).not.toContain(text.party.otherNotice);
    });

    it('types its own address, with nothing to save it to', async () => {
      const page = await render({ guest: true });

      expect(page.el.querySelector('[id$="-postalCode"]')).not.toBeNull();
      expect(page.text()).not.toContain(text.addresses.saveToBook);
    });

    it('sends the contact it was given and names the party itself', async () => {
      const page = await render({ guest: true });

      page.type('#contact-name', 'Ada Lovelace');
      page.type('#contact-email', 'ada@example.com');
      page.type('#contact-phone', '4012345678');
      page.type('input[autocomplete="street-address"]', 'Hafenstraße 12');
      page.type('[id$="-postalCode"]', '20359');
      page.type('[id$="-city"]', 'Hamburg');
      await page.settle();

      await page.review();
      page.el.querySelector<HTMLInputElement>('#accept-privacy')?.click();
      await page.settle();
      page.button(text.submit)?.click();
      await page.settle();

      expect(sent).toHaveLength(1);
      expect(sent[0].contact).toMatchObject({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      });
      // Never null for a guest: there is no account for the server to read.
      expect(sent[0].party).toMatchObject({
        name: 'Ada Lovelace',
        registrationId: null,
      });
    });

    it('asks a company for its own name and a person to ring', async () => {
      const page = await render({ guest: true });

      page.pick('party-kind', 'company');
      await page.settle();

      expect(page.el.querySelector('#party-companyName')).not.toBeNull();
      expect(page.el.querySelector('#party-companyId')).not.toBeNull();
      // Still asked who to ring: a company is the party, somebody at it is the
      // contact, and those are two answers rather than one.
      expect(page.el.querySelector('#contact-name')).not.toBeNull();
    });

    it('stops asking for a company once the party is a person again', async () => {
      const page = await render({ guest: true });

      page.pick('party-kind', 'company');
      await page.settle();
      page.pick('party-kind', 'person');
      await page.settle();

      page.type('#contact-name', 'Ada Lovelace');
      page.type('#contact-email', 'ada@example.com');
      page.type('#contact-phone', '4012345678');
      page.type('input[autocomplete="street-address"]', 'Hafenstraße 12');
      page.type('[id$="-postalCode"]', '20359');
      page.type('[id$="-city"]', 'Hamburg');
      await page.settle();

      await page.review();

      // Nothing about a company is asked of a private party, so nothing about
      // one can hold the form back.
      expect(page.text()).toContain(text.review.title);
    });

    it('drops an address the draft names but this visitor cannot see', async () => {
      // A draft written while signed in, read after signing out: the row it
      // names is nobody's now. Silently unbuildable, and no field to blame.
      sessionStorage.setItem(
        CHECKOUT_DRAFT_KEY,
        JSON.stringify({
          version: CHECKOUT_DRAFT_VERSION,
          draft: { ...emptyDraft(), deliveryAddressId: saved.id },
        }),
      );
      const page = await render({ guest: true });

      expect(page.drafts.draft().deliveryAddressId).toBeNull();
      expect(page.el.querySelector('[id$="-postalCode"]')).not.toBeNull();
    });

    it('drops a submission whose honeypot was filled', async () => {
      const page = await render({ guest: true });

      page.type('#contact-name', 'Ada Lovelace');
      page.type('#contact-email', 'ada@example.com');
      page.type('#contact-phone', '4012345678');
      page.type('input[autocomplete="street-address"]', 'Hafenstraße 12');
      page.type('[id$="-postalCode"]', '20359');
      page.type('[id$="-city"]', 'Hamburg');
      page.type('#checkout-website', 'https://example.com');
      await page.settle();

      await page.review();

      expect(page.text()).not.toContain(text.review.title);
      expect(submitted).not.toHaveBeenCalled();
    });
  });

  describe('the read-back before it is sent', () => {
    it('reads the order back rather than sending it', async () => {
      const page = await render();

      page.drafts.patch({ customerNote: 'Ring the bell at the back gate.' });
      await page.review();

      expect(submitted).not.toHaveBeenCalled();
      expect(page.text()).toContain(text.review.title);
      // The lines, and the answers in the order they were asked for.
      expect(page.text()).toContain('Filter Roast');
      expect(page.text()).toContain(text.fulfilment.deliveryTitle);
      expect(page.text()).toContain('Hafenstraße 12');
      expect(page.text()).toContain(text.review.billingSame);
      expect(page.text()).toContain(text.timing.deliveryLabel);
      expect(page.text()).toContain(text.review.whenAny);
      // The unit it was bought in, and what that comes to in pieces.
      expect(page.text()).toContain('2 pk (12 pcs)');
      expect(page.text()).toContain(text.payment.cashTitle);
      expect(page.text()).toContain('Ring the bell at the back gate.');
      // Nothing to edit here: the form is one click back.
      expect(page.el.querySelector('#order-note')).toBeNull();
    });

    it('stays on the form while an answer is missing', async () => {
      const page = await render();

      page.pick('party', 'other');
      await page.settle();
      page.pick('party-kind', 'company');
      await page.settle();
      await page.review();

      expect(page.text()).not.toContain(text.review.title);
      expect(page.text()).toContain(text.errors.incomplete);
    });

    it('goes back to the form with everything still answered', async () => {
      const page = await render();

      page.drafts.patch({ customerNote: 'Ring the bell at the back gate.' });
      await page.review();
      page.button(text.review.back)?.click();
      await page.settle();

      expect(page.text()).toContain(text.fulfilment.heading);
      expect(page.value('#order-note')).toBe('Ring the bell at the back gate.');
    });
  });

  describe('an account with no telephone number', () => {
    it('says so and will not send, rather than letting the API refuse it', async () => {
      const page = await render({ noPhone: true });
      await page.review();

      expect(page.text()).toContain(text.phoneMissing);
      expect(page.button(text.submit)?.disabled).toBe(true);

      page.button(text.submit)?.click();
      await page.settle();
      expect(submitted).not.toHaveBeenCalled();
    });

    it('leaves an account that has one alone', async () => {
      const page = await render();
      await page.review();

      expect(page.text()).not.toContain(text.phoneMissing);
      expect(page.button(text.submit)?.disabled).toBe(false);
    });
  });

  describe('a staff session', () => {
    it('says staff do not buy and will not send', async () => {
      const page = await render({ role: 'manager' });
      await page.review();

      expect(page.text()).toContain(text.errors.staffAccount);
      expect(page.button(text.submit)?.disabled).toBe(true);

      page.button(text.submit)?.click();
      await page.settle();
      expect(submitted).not.toHaveBeenCalled();
    });

    it('says that and not the missing-phone notice, which is not the reason', async () => {
      const page = await render({ role: 'admin', noPhone: true });
      await page.review();

      expect(page.text()).not.toContain(text.phoneMissing);
    });
  });

  describe('sending the order', () => {
    it('refuses to send until the privacy notice is accepted', async () => {
      const page = await render();

      await page.review();
      page.button(text.submit)?.click();
      await page.settle();

      expect(submitted).not.toHaveBeenCalled();
      expect(page.text()).toContain(text.privacyRequired);
    });

    it('sends what the form was answered with', async () => {
      const page = await render();

      page.drafts.patch({
        preferredDate: '2026-09-03',
        customerNote: 'Ring the bell at the back gate.',
      });
      await page.review();
      page.el.querySelector<HTMLInputElement>('#accept-privacy')?.click();
      await page.settle();

      page.button(text.submit)?.click();
      await page.settle();

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        fulfilmentMethod: 'delivery',
        // The account's own party is resolved by the server, not asserted here.
        party: null,
        pickupLocationKey: null,
        paymentMethod: 'cash',
        preferredDate: '2026-09-03',
        customerNote: 'Ring the bell at the back gate.',
        acceptPrivacy: true,
      });
      expect(sent[0].deliveryAddress).toMatchObject({ postalCode: '20359' });
      // Ticked "the same address": the invoice goes where the goods do.
      expect(sent[0].billingAddress).toEqual(sent[0].deliveryAddress);
    });

    it('names the order back and empties the cart', async () => {
      const page = await render();

      await page.review();
      page.el.querySelector<HTMLInputElement>('#accept-privacy')?.click();
      await page.settle();
      page.button(text.submit)?.click();
      await page.settle();

      expect(page.text()).toContain(text.successHeading);
      expect(page.text()).toContain('CK-260827-0042');
      expect(page.drafts.draft().customerNote).toBeNull();
    });

    it('puts a refusal in the customer’s own words', async () => {
      const page = await render({
        submit: { ok: false, code: 'billing-details-required' },
      });

      await page.review();
      page.el.querySelector<HTMLInputElement>('#accept-privacy')?.click();
      await page.settle();
      page.button(text.submit)?.click();
      await page.settle();

      expect(page.text()).toContain(text.errors.billingDetailsRequired);
      expect(page.text()).not.toContain(text.successHeading);
    });
  });
});
