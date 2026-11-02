import { normalizePhone } from '@b2b-catalog-platform/shared';
import { storedPhone } from './stored-phone';

describe('storedPhone', () => {
  const rule = (value: string) =>
    normalizePhone(value, { countryCode: '+49', mask: '(###) ###-####' });

  it('leaves an absent field absent', () => {
    expect(storedPhone(rule, undefined)).toBeUndefined();
  });

  it('stores no number for an empty or cleared one', () => {
    expect(storedPhone(rule, null)).toBeNull();
    expect(storedPhone(rule, '  ')).toBeNull();
  });

  it('stores the canonical form of what was entered', () => {
    expect(storedPhone(rule, '+49 (401) 234-5678')).toBe('+494012345678');
  });

  it('refuses a number the rule cannot read', () => {
    expect(() => storedPhone(rule, '+7 914 123-45-67')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'phone-format' }),
      }),
    );
  });

  // A number from before the rule, or from an external system, must not stop
  // a name from being corrected beside it.
  it('keeps the stored number unread when it comes back unchanged', () => {
    expect(storedPhone(rule, '8 (3952) 12-34-56', '8 (3952) 12-34-56')).toBe(
      '8 (3952) 12-34-56',
    );
  });

  it('reads a changed number even where the stored one was unreadable', () => {
    expect(() =>
      storedPhone(rule, '8 (3952) 12-34-57', '8 (3952) 12-34-56'),
    ).toThrow();
  });
});
