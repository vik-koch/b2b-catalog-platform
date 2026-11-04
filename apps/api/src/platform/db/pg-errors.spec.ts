import { isForeignKeyViolation, isUniqueViolation } from './pg-errors';

describe('isUniqueViolation', () => {
  it('recognises a unique violation and nothing else', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  // Drizzle hands the driver's error on as the `cause` of one of its own, so
  // the chain is what carries the code.
  it('finds the code on a wrapped error', () => {
    expect(
      isUniqueViolation(
        new Error('Failed query', { cause: { code: '23505' } }),
      ),
    ).toBe(true);
    expect(
      isUniqueViolation(
        new Error('Failed query', { cause: { code: '23503' } }),
      ),
    ).toBe(false);
  });
});

describe('isForeignKeyViolation', () => {
  it('finds the code on a wrapped error, and only that code', () => {
    expect(
      isForeignKeyViolation(
        new Error('Failed query', { cause: { code: '23503' } }),
      ),
    ).toBe(true);
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
  });
});
