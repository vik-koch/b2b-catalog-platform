import {
  isUniqueViolation,
  orderPublicToken,
  orderReference,
  orderReferenceDate,
} from './order-reference';

describe('orderReferenceDate', () => {
  it('reads the date in the deployment timezone, not the server one', () => {
    // 22:30 UTC on the 3rd is already the 4th in Berlin.
    const late = new Date('2026-08-03T22:30:00.000Z');

    expect(orderReferenceDate(late, 'Europe/Berlin')).toBe('260804');
    expect(orderReferenceDate(late, 'UTC')).toBe('260803');
  });
});

describe('orderReference', () => {
  it('reads as prefix, date and a four-digit suffix', () => {
    const reference = orderReference(
      { prefix: 'CK', timezone: 'UTC' },
      new Date('2026-08-24T09:00:00.000Z'),
      '0042',
    );

    expect(reference).toBe('CK-260824-0042');
  });

  it('pads a random suffix to four digits, so references sort as text', () => {
    const references = Array.from({ length: 50 }, () =>
      orderReference({ prefix: 'CK', timezone: 'UTC' }),
    );

    for (const reference of references) {
      expect(reference).toMatch(/^CK-\d{6}-\d{4}$/);
    }
  });
});

describe('orderPublicToken', () => {
  it('is URL-safe and long enough to be a credential', () => {
    const token = orderPublicToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(orderPublicToken()).not.toBe(token);
  });
});

describe('isUniqueViolation', () => {
  it('recognises a collided reference and nothing else', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
