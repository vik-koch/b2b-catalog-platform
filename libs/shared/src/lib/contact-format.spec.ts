import {
  applyMask,
  canonicalPhone,
  CompanyIdFormat,
  companyIdFormatOf,
  companyIdMatchesAny,
  formatPhone,
  normalizeCompanyId,
  PhoneConfig,
  stripDialPrefix,
  typedPhone,
} from './contact-format';
import { emailField, lowercaseEmailField } from './contact-config';

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

describe('stripDialPrefix', () => {
  // The field shows "+49" beside itself and holds the national part alone, so
  // an autofilled international number arrives with the code counted twice.
  it('takes off the two international forms a browser writes', () => {
    expect(stripDialPrefix('+49 40 1234567', '+49')).toBe(' 40 1234567');
    expect(stripDialPrefix('004940 1234567', '+49')).toBe('40 1234567');
    expect(stripDialPrefix('+49(40)1234567', '+49')).toBe('(40)1234567');
  });

  it('leaves a national number alone, however it starts', () => {
    // Bare "49…" is ambiguous — a national number may open with its own
    // country's digits — so it is never guessed at.
    expect(stripDialPrefix('49 1234567', '+49')).toBe('49 1234567');
    expect(stripDialPrefix('040 1234567', '+49')).toBe('040 1234567');
    expect(stripDialPrefix('', '+49')).toBe('');
  });

  it('leaves a number whose code is somebody else’s', () => {
    expect(stripDialPrefix('+33 1 23456789', '+49')).toBe('+33 1 23456789');
    expect(stripDialPrefix('+4', '+49')).toBe('+4');
  });

  it('is a no-op without a configured code', () => {
    expect(stripDialPrefix('+49 40 1234567', '')).toBe('+49 40 1234567');
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

/**
 * Which shape a stored registration number is in — what dresses the field when
 * an account or an address is opened for editing. Wrong here is not cosmetic:
 * the field masks the number into the format it was told, so a format whose
 * mask is too short truncates it, and the next save stores the truncation.
 */
describe('companyIdFormatOf', () => {
  const vat: CompanyIdFormat = {
    key: 'vat',
    pattern: '^DE[0-9]{9}$',
    example: 'DE123456789',
  };
  const short: CompanyIdFormat = {
    key: 'short',
    pattern: '^[0-9]{10}$',
    example: '1234567890',
  };

  it('picks the format whose pattern the number matches', () => {
    expect(companyIdFormatOf('DE123456789', [vat, short])?.key).toBe('vat');
    expect(companyIdFormatOf('1234567890', [vat, short])?.key).toBe('short');
  });

  // Which of two overlapping shapes a number "really" is cannot be recovered
  // from the number, and nothing downstream needs it to be: this only names a
  // stored value for the staff filter.
  it('takes the first format that matches where two overlap', () => {
    const loose: CompanyIdFormat = {
      key: 'loose',
      pattern: '^[0-9]+$',
      example: '1',
    };
    expect(companyIdFormatOf('1234567890', [loose, short])?.key).toBe('loose');
  });

  it('leaves a number in no configured shape unclaimed', () => {
    expect(companyIdFormatOf('XX-9999', [vat, short])).toBeUndefined();
    expect(companyIdFormatOf(null, [vat])).toBeUndefined();
    expect(companyIdFormatOf('DE123456789', undefined)).toBeUndefined();
  });
});

describe('normalizeCompanyId', () => {
  // A number is typed the way it is printed on a letterhead. Refusing it for a
  // space would be refusing the number.
  it('is the same number however it was typed', () => {
    expect(normalizeCompanyId('de 123 456 789')).toBe('DE123456789');
    expect(normalizeCompanyId('DE123456789')).toBe('DE123456789');
  });
});

describe('companyIdMatchesAny', () => {
  const vat: CompanyIdFormat = {
    key: 'vat',
    pattern: '^DE[0-9]{9}$',
    example: 'DE123456789',
  };
  const tax: CompanyIdFormat = {
    key: 'tax',
    pattern: '^[0-9]{10}$',
    example: '1234567890',
  };

  it('accepts a number in any configured shape', () => {
    expect(companyIdMatchesAny('DE123456789', [vat, tax])).toBe(true);
    expect(companyIdMatchesAny('1234567890', [vat, tax])).toBe(true);
    expect(companyIdMatchesAny('12345', [vat, tax])).toBe(false);
  });

  it('normalizes before it measures', () => {
    expect(companyIdMatchesAny('de 123 456 789', [vat])).toBe(true);
  });

  // A deployment in a jurisdiction whose numbers it has not described accepts
  // whatever the contract's envelope allows, rather than nothing at all.
  it('has no shape rule where no formats are configured', () => {
    expect(companyIdMatchesAny('anything', undefined)).toBe(true);
    expect(companyIdMatchesAny('anything', [])).toBe(true);
  });
});

/**
 * The trim has to happen before the format check, not after. Writing the field
 * the other way round — an email schema with a trim hung off it — reads the
 * same and refuses an address pasted with a space around it, which is most of
 * the ways one arrives.
 */
describe('emailField', () => {
  const field = emailField(320);

  it('accepts an address pasted with space around it, and keeps the trim', () => {
    expect(field.parse('  jane@example.com  ')).toBe('jane@example.com');
  });

  it('still refuses one that is not an address', () => {
    expect(field.safeParse('  not-an-address  ').success).toBe(false);
  });

  it('measures the length against the trimmed value', () => {
    // 300 + '@example.com' = 312 characters.
    const long = `${'a'.repeat(300)}@example.com`;

    expect(emailField(320).safeParse(`  ${long}  `).success).toBe(true);
    expect(emailField(100).safeParse(long).success).toBe(false);
  });

  it('lowercases where the address is stored folded', () => {
    expect(lowercaseEmailField(255).parse(' Jane@Example.COM ')).toBe(
      'jane@example.com',
    );
  });
});
