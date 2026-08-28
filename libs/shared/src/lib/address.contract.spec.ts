import {
  ADDRESS_LINE_MAX_LENGTH,
  addressInputSchema,
  countryCodeSchema,
} from './address.contract';

const address = (overrides: Record<string, unknown> = {}) => ({
  label: null,
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
  ...overrides,
});

const parse = (overrides: Record<string, unknown> = {}) =>
  addressInputSchema.safeParse(address(overrides));
const accepts = (overrides: Record<string, unknown> = {}) =>
  parse(overrides).success;

/**
 * An address is a **place**, and the schema is where that is enforced: the
 * identity that used to live here is the order's own field now (ADR 0039), and
 * `strict` is what stops the old shape being sent anyway and silently ignored.
 */
describe('addressInputSchema', () => {
  it('accepts a place', () => {
    expect(accepts()).toBe(true);
  });

  it('carries no identity and no phone, however hard one is pushed at it', () => {
    // Each of these was a column here before the 2026-08-27 revision.
    expect(accepts({ companyName: 'Kontor GmbH' })).toBe(false);
    expect(accepts({ companyId: 'DE123456789' })).toBe(false);
    expect(accepts({ phone: '+49 40 1234567' })).toBe(false);
  });

  // The optional lines are null or written, never blank: a nullable field and
  // an empty string are two ways of saying nothing, and only one is stored.
  it('takes an optional line as null or as text, not as emptiness', () => {
    expect(accepts({ street2: null, region: null, label: null })).toBe(true);
    expect(accepts({ street2: 'Second floor' })).toBe(true);
    expect(accepts({ street2: '' })).toBe(false);
    expect(accepts({ region: '   ' })).toBe(false);
  });

  it('insists on the lines an address cannot be delivered without', () => {
    expect(accepts({ street: '' })).toBe(false);
    expect(accepts({ postalCode: '' })).toBe(false);
    expect(accepts({ city: '' })).toBe(false);
  });

  it('trims what it stores, so a stray space is not part of the address', () => {
    expect(parse({ city: '  Hamburg  ' }).data?.city).toBe('Hamburg');
  });

  it('bounds each line rather than storing a paragraph', () => {
    expect(accepts({ street: 'x'.repeat(ADDRESS_LINE_MAX_LENGTH) })).toBe(true);
    expect(accepts({ street: 'x'.repeat(ADDRESS_LINE_MAX_LENGTH + 1) })).toBe(
      false,
    );
  });
});

/**
 * The country is a **code**, or an immutable snapshot reads `DE` on one order
 * and `Deutschland` on the next and nobody can group by it.
 */
describe('countryCodeSchema', () => {
  it('normalises what it accepts, so one country has one spelling', () => {
    expect(countryCodeSchema.parse(' de ')).toBe('DE');
    expect(countryCodeSchema.parse('At')).toBe('AT');
  });

  it('refuses anything that is not two letters', () => {
    for (const bad of ['Deutschland', 'D', 'DEU', '49', 'D1', '']) {
      expect(countryCodeSchema.safeParse(bad).success).toBe(false);
    }
  });
});
