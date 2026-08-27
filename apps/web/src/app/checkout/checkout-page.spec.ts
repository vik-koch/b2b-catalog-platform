import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Address } from '@b2b-catalog-platform/shared';
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
}

async function render(options: Options = {}) {
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
     * subscriptions run. */
    type: (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`No ${selector} on the page`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    },
    value: (selector: string) =>
      el.querySelector<HTMLInputElement>(selector)?.value,
    /** Picks a party through its radio, which is what the page listens to. */
    chooseParty: (party: string) => {
      const radio = el.querySelector<HTMLInputElement>(
        `input[name="party"][value="${party}"]`,
      );
      if (!radio) throw new Error(`No ${party} party option on the page`);
      radio.click();
    },
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
      expect(page.text()).toContain(text.party.company);
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

    it('does not carry a person’s name into the company field', async () => {
      const page = await render();

      page.drafts.patch({ party: 'person' });
      await page.settle();
      page.type('#party-personName', 'Alex Fischer');
      expect(page.drafts.draft().otherPartyName).toBe('Alex Fischer');

      page.chooseParty('company');
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

    it('falls back to the fields where the book cannot be read', async () => {
      const page = await render({ addresses: [] });

      expect(page.text()).toContain(text.addresses.bookEmpty);
      expect(page.drafts.draft().deliveryAddressId).toBeNull();
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
  });
});
