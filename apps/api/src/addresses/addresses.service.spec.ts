import { ConflictException, Logger } from '@nestjs/common';
import { AddressConfig, AddressInput } from '@b2b-catalog-platform/shared';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { AddressesService } from './addresses.service';

const address: AddressInput = {
  label: null,
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
};

const ships = (...codes: string[]): AddressConfig => ({
  countries: codes.map((code) => ({ code, label: code })),
});

/** A deployment shipping to one country that has a postal rule and one that
 * does not — the rule belongs to the country, not to the deployment. */
const postal = () =>
  service({
    countries: [
      {
        code: 'DE',
        label: 'DE',
        postalCode: { pattern: '^[0-9]{5}$', example: '20457', mask: '#####' },
      },
      { code: 'AT', label: 'AT' },
    ],
  });

function service(config?: AddressConfig): AddressesService {
  // No database: what is under test here is the rule the browser is not
  // trusted with, and the seed's silence. The reading and writing paths are
  // covered against a real Postgres in apps/api-e2e (addresses.spec.ts) —
  // stubbing a query builder to re-prove them would test the stub.
  return new AddressesService(
    undefined as unknown as NodePgDatabase<typeof schema>,
    config,
  );
}

/**
 * The country list is a **rule**, not only a picker (FR-CART-07): the browser
 * sends whatever it likes, and an address outside the countries a deployment
 * ships to would become an order nobody can fulfil.
 */
describe('AddressesService.assertValid', () => {
  it('accepts a country the deployment ships to', () => {
    expect(() => service(ships('DE', 'AT')).assertValid(address)).not.toThrow();
  });

  it('refuses one it does not, with a code rather than a message', () => {
    const refuse = () =>
      service(ships('DE')).assertValid({ ...address, country: 'FR' });

    expect(refuse).toThrow(ConflictException);
    // The web renders a code through its own text, never an exception's prose.
    expect(() => refuse()).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'unsupported-country' }),
      }) as unknown as Error,
    );
  });

  it('takes any well-formed code where a deployment configures none', () => {
    expect(() =>
      service(undefined).assertValid({ ...address, country: 'JP' }),
    ).not.toThrow();
  });

  /**
   * The mask in the browser caps what can be typed and says nothing about what
   * arrives — and the delivery zone is resolved from this field, so a code in
   * the wrong shape is an order quoted against the wrong area.
   */
  it("refuses a postal code that is not its country's shape", () => {
    const refuse = () =>
      postal().assertValid({ ...address, postalCode: '2035' });

    expect(refuse).toThrow(ConflictException);
    expect(refuse).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'invalid-postal-code' }),
      }) as unknown as Error,
    );
  });

  it('accepts one in the shape the country asks for', () => {
    expect(() => postal().assertValid(address)).not.toThrow();
  });

  // Typed the way it is printed; refusing it over a space would be refusing
  // the code.
  it('normalizes the code before measuring it', () => {
    expect(() =>
      postal().assertValid({ ...address, postalCode: '203 59' }),
    ).not.toThrow();
  });

  // The rule belongs to the country, so an address in another one is not
  // measured against it.
  it('leaves a country with no rule of its own alone', () => {
    expect(() =>
      postal().assertValid({ ...address, country: 'AT', postalCode: '1010' }),
    ).not.toThrow();
  });

  it('matches the whole code, so a near neighbour is still refused', () => {
    // Case never reaches here — `countryCodeSchema` upper-cases at the
    // contract — so what this guards is the comparison itself: DK is not DE.
    expect(() =>
      service(ships('DE')).assertValid({ ...address, country: 'DK' }),
    ).toThrow(ConflictException);
  });
});

/**
 * Seeding the first address from a registration suggestion (FR-AUTH-10) is a
 * convenience hung off a flow that must not fail for it: nobody's account is
 * worth less because a registry answered half an address.
 */
describe('AddressesService.seed', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // The swallowed failure logs; the assertion is that it is swallowed.
    });
  });

  afterEach(() => warn.mockRestore());

  it('swallows a refusal rather than failing the registration', async () => {
    // An unsupported country is the likeliest one: a suggestion provider is
    // not bound by the deployment's shipping list.
    const seeding = service(ships('DE')).seed('user-1', {
      ...address,
      country: 'FR',
    });

    await expect(seeding).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('swallows a database failure the same way', async () => {
    // No `db` at all, so `create` throws on reaching for it.
    await expect(
      service(undefined).seed('user-1', address),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
