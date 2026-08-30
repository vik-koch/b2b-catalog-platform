import { orderSubmissionSchema } from './orders.contract';

const address = {
  label: null,
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
};

const submission = (overrides: Record<string, unknown> = {}) => ({
  lines: [{ slug: 'hafen-espresso', unit: 'pack', pieces: 12 }],
  contact: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+49 40 7654321',
  },
  fulfilmentMethod: 'delivery',
  party: { name: 'Kontor GmbH', registrationId: 'DE123456789' },
  deliveryAddress: address,
  pickupLocationKey: null,
  billingAddress: address,
  paymentMethod: 'cash',
  preferredDate: null,
  customerNote: null,
  expectedTotalMinor: 8280,
  acceptPrivacy: true,
  ...overrides,
});

const accepts = (overrides: Record<string, unknown> = {}) =>
  orderSubmissionSchema.safeParse(submission(overrides)).success;

/**
 * The one schema both apps validate an order against. What is worth pinning is
 * not the field list — the types carry that — but the rules a browser could
 * otherwise talk its way around, and the ones a refactor could quietly drop.
 */
describe('orderSubmissionSchema', () => {
  it('accepts an ordinary delivery order', () => {
    expect(accepts()).toBe(true);
  });

  /**
   * A hidden branch must be inert, not merely invisible (ADR 0039): an
   * abandoned pickup choice must not ride along on a delivery order, or the
   * order names two destinations and the shop picks one.
   */
  describe('fulfilment needs exactly its own destination', () => {
    it('refuses a delivery order that also names a collection point', () => {
      expect(accepts({ pickupLocationKey: 'speicherstadt' })).toBe(false);
    });

    it('refuses a delivery order with no address', () => {
      expect(accepts({ deliveryAddress: null })).toBe(false);
    });

    it('accepts a pickup order that drops the address for a point', () => {
      expect(
        accepts({
          fulfilmentMethod: 'pickup',
          deliveryAddress: null,
          pickupLocationKey: 'speicherstadt',
        }),
      ).toBe(true);
    });

    it('refuses a pickup order that still carries a delivery address', () => {
      expect(
        accepts({
          fulfilmentMethod: 'pickup',
          pickupLocationKey: 'speicherstadt',
        }),
      ).toBe(false);
    });

    it('refuses a pickup order naming no point at all', () => {
      expect(
        accepts({ fulfilmentMethod: 'pickup', deliveryAddress: null }),
      ).toBe(false);
    });
  });

  // Whether an order carries an invoice address is the deployment's answer
  // (`billingAddressEnabled`), which a shared schema cannot see — so the
  // envelope takes either and the server holds the submission to the config.
  it('takes an order with no billing address', () => {
    expect(
      accepts({
        fulfilmentMethod: 'pickup',
        deliveryAddress: null,
        pickupLocationKey: 'speicherstadt',
        billingAddress: null,
      }),
    ).toBe(true);
  });

  // FR-CART-03: consent is a `literal(true)`, so an order cannot be sent with
  // it merely present, nor with it false.
  it('takes only an accepted privacy notice', () => {
    expect(accepts({ acceptPrivacy: false })).toBe(false);
    expect(accepts({ acceptPrivacy: undefined })).toBe(false);
    expect(accepts({ acceptPrivacy: 'yes' })).toBe(false);
  });

  /**
   * `expectedTotalMinor` is a comparand, never an input: without it a customer
   * previews €100, an admin edits the price, and the submit books €120 in
   * silence. It must therefore always be present.
   */
  it('insists on a total to compare against', () => {
    expect(accepts({ expectedTotalMinor: undefined })).toBe(false);
    expect(accepts({ expectedTotalMinor: -1 })).toBe(false);
    expect(accepts({ expectedTotalMinor: 12.5 })).toBe(false);
    // Zero is a real answer: a cart whose every line lost its price.
    expect(accepts({ expectedTotalMinor: 0 })).toBe(true);
  });

  // NFR-SEC-05: unknown keys are rejected rather than stripped, so a field
  // removed from the contract cannot go on being sent and silently ignored.
  it('refuses a key it does not know', () => {
    expect(accepts({ deliveryAddressId: 'a-row-it-no-longer-records' })).toBe(
      false,
    );
    expect(accepts({ tierKey: 'wholesale' })).toBe(false);
  });

  // ADR 0015's honeypot: a bot fills it, a person never sees it. Optional, so
  // an honest form need not send it at all.
  it('allows the honeypot to be absent, present or empty', () => {
    expect(accepts({ website: undefined })).toBe(true);
    expect(accepts({ website: '' })).toBe(true);
    expect(accepts({ website: 'http://spam.example' })).toBe(true);
  });

  // The party is nullable: a signed-in customer's own party is resolved by the
  // server from their account, never taken from the browser.
  it('lets the party be left to the server', () => {
    expect(accepts({ party: null })).toBe(true);
  });

  it('takes a preferred date as an ISO day, not as prose', () => {
    expect(accepts({ preferredDate: '2026-09-03' })).toBe(true);
    expect(accepts({ preferredDate: 'next Tuesday' })).toBe(false);
    expect(accepts({ preferredDate: '2026-09-03T10:00:00Z' })).toBe(false);
  });
});
