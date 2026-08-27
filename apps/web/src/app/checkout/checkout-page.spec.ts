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
import { AddressesService } from '../addresses/addresses.service';
import { packagedPackaging } from '../catalog/product.fixture';
import { CartAddition, CartService } from '../cart/cart.service';
import { CheckoutDraftService } from './checkout-draft.service';
import { CheckoutPage } from './checkout-page';
import { OrdersService, SubmitOrderResult } from './orders.service';

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
            phone: '+494012345678',
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
        deliveryAddressId: saved.id,
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
