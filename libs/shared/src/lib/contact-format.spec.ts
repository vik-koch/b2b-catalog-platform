import {
  applyMask,
  canonicalPhone,
  formatPhone,
  PhoneConfig,
  typedPhone,
} from './contact-format';

const config: PhoneConfig = { countryCode: '+49', mask: '(###) ###-####' };
/** A deployment that fixes a country code but does not group the digits. */
const unmasked: PhoneConfig = { countryCode: '+49' };

describe('applyMask', () => {
  it('groups digits and drops anything past the mask', () => {
    expect(applyMask('4012345678', '(###) ###-####')).toBe('(401) 234-5678');
    expect(applyMask('40123456789999', '(###) ###-####')).toBe(
      '(401) 234-5678',
    );
  });

  it('groups a partial value as far as it goes', () => {
    expect(applyMask('401', '(###) ###-####')).toBe('(401');
    expect(applyMask('', '(###) ###-####')).toBe('');
  });

  it('reformats an already-grouped value rather than doubling its separators', () => {
    expect(applyMask('(401) 234-5678', '(###) ###-####')).toBe(
      '(401) 234-5678',
    );
  });

  it('means digits-only when empty, with no length limit', () => {
    expect(applyMask('(401) 234-5678 90', '')).toBe('401234567890');
  });
});

describe('canonicalPhone', () => {
  it('stores the country code and bare digits, with no grouping', () => {
    expect(canonicalPhone('(401) 234-5678', config)).toBe('+494012345678');
    expect(canonicalPhone('4012345678', config)).toBe('+494012345678');
  });

  it('is empty for an empty field, so nothing is stored but the code', () => {
    expect(canonicalPhone('', config)).toBe('');
    expect(canonicalPhone('   ', config)).toBe('');
  });

  it('leaves a deployment without phone config to type what it likes', () => {
    expect(canonicalPhone(' +1 (555) 0100 ext. 4 ', undefined)).toBe(
      '+1 (555) 0100 ext. 4',
    );
  });
});

describe('typedPhone', () => {
  it('hands back the part the entry field owns', () => {
    expect(typedPhone('+494012345678', config)).toBe('4012345678');
  });

  it('leaves a foreign number whole rather than reattributing it', () => {
    expect(typedPhone('+13125550100', config)).toBe('+13125550100');
  });

  it('treats a missing number as an empty field', () => {
    expect(typedPhone(null, config)).toBe('');
  });
});

describe('formatPhone', () => {
  it('reads a stored number back with the deployment grouping', () => {
    expect(formatPhone('+494012345678', config)).toBe('+49 (401) 234-5678');
  });

  /**
   * The number is either from another country or from before this mask. Half a
   * grouping would misrepresent it, and refusing to show it would lose it.
   */
  it('shows a number that does not fit the mask exactly as stored', () => {
    expect(formatPhone('+49401234', config)).toBe('+49401234');
    expect(formatPhone('+13125550100', config)).toBe('+13125550100');
  });

  it('has nothing to add without a mask, or without a number', () => {
    expect(formatPhone('+494012345678', unmasked)).toBe('+494012345678');
    expect(formatPhone('+494012345678', undefined)).toBe('+494012345678');
    expect(formatPhone(null, config)).toBe('');
  });
});

/**
 * The round trip the account and staff editors make on every save: read a
 * stored number into the field, type nothing, store it again. It has to come
 * back identical — a number that changes by being looked at is one the next
 * save would refuse as incomplete.
 */
describe('the editor round trip', () => {
  it('returns a stored number unchanged', () => {
    const stored = '+494012345678';
    const shown = applyMask(typedPhone(stored, config), config.mask ?? '');

    expect(shown).toBe('(401) 234-5678');
    expect(canonicalPhone(shown, config)).toBe(stored);
  });
});
