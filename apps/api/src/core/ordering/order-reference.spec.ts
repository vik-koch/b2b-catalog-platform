import {
  orderPublicToken,
  orderReference,
  orderReferenceDate,
} from './order-reference';

describe('orderReferenceDate', () => {
  it("reads the date in the shop's time zone, not the server's", () => {
    // 22:30 UTC on the 3rd is already the 4th in Berlin.
    const late = new Date('2026-08-03T22:30:00.000Z');

    expect(orderReferenceDate(late, 'Europe/Berlin')).toBe('260804');
    expect(orderReferenceDate(late, 'UTC')).toBe('260803');
  });
});

describe('orderReference', () => {
  const at = new Date('2026-11-06T09:00:00.000Z');
  const counting = () => {
    let next = 0;
    return () => next++ % 10;
  };

  it('fills the date and each # in the deployment format', () => {
    expect(
      orderReference({ format: 'CK{date}-####' }, 'UTC', at, counting()),
    ).toBe('CK261106-0123');
    expect(
      orderReference({ format: '{date}-CK-#####' }, 'UTC', at, counting()),
    ).toBe('261106-CK-01234');
  });

  it('draws a random digit for every #', () => {
    const references = Array.from({ length: 50 }, () =>
      orderReference({ format: 'CK{date}-####' }, 'UTC'),
    );

    for (const reference of references) {
      expect(reference).toMatch(/^CK\d{6}-\d{4}$/);
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
