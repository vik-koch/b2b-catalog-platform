import {
  emailField,
  lowercaseEmailField,
  personNameField,
  storedEmailField,
} from './contact-config';
import {
  applyMask,
  canonicalPhone,
  CompanyIdFormat,
  companyIdFormatOf,
  companyIdMatchesAny,
  formatPhone,
  normalizeCompanyId,
  normalizePhone,
  PhoneConfig,
  stripDialPrefix,
  typedPhone,
} from './contact-format';
import { EMAIL_MAX_LENGTH } from './email-format';
import { isPersonName } from './person-name';

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
  it('takes off the two international forms a browser writes', () => {
    expect(stripDialPrefix('+49 40 1234567', '+49')).toBe(' 40 1234567');
    expect(stripDialPrefix('004940 1234567', '+49')).toBe('40 1234567');
    expect(stripDialPrefix('+49(40)1234567', '+49')).toBe('(40)1234567');
  });

  it('leaves a national number alone, however it starts', () => {
    // A national number may open with its own country's digits.
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

describe('normalizePhone', () => {
  it('reads the canonical form the browser sends as itself', () => {
    expect(normalizePhone('+494012345678', config)).toBe('+494012345678');
  });

  it('reads a grouped or national number into the canonical form', () => {
    expect(normalizePhone('+49 (401) 234-5678', config)).toBe('+494012345678');
    expect(normalizePhone('0049 401 234 5678', config)).toBe('+494012345678');
    expect(normalizePhone('(401) 234-5678', config)).toBe('+494012345678');
  });

  it('refuses a number from another country', () => {
    expect(normalizePhone('+7 914 123-45-67', config)).toBeNull();
    expect(normalizePhone('+7 914 123-45-67', unmasked)).toBeNull();
  });

  it('refuses a number that does not fill the mask', () => {
    expect(normalizePhone('401 234 567', config)).toBeNull();
    expect(normalizePhone('+49 401 234 56789', config)).toBeNull();
  });

  it('refuses letters and a value with no digits', () => {
    expect(normalizePhone('401 234 5678 ext. 4', config)).toBeNull();
    expect(normalizePhone('---', config)).toBeNull();
  });

  it('takes any length without a mask', () => {
    expect(normalizePhone('40 123', unmasked)).toBe('+4940123');
  });

  it('keeps the value as typed without phone config', () => {
    expect(normalizePhone(' +1 (555) 0100 ext. 4 ', undefined)).toBe(
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

/** An editor reads a stored number into its field and saves it untouched: a
 * number that changed by being looked at would fail the next save. */
describe('the editor round trip', () => {
  it('returns a stored number unchanged', () => {
    const stored = '+494012345678';
    const shown = applyMask(typedPhone(stored, config), config.mask ?? '');

    expect(shown).toBe('(401) 234-5678');
    expect(canonicalPhone(shown, config)).toBe(stored);
  });
});

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

  it('has no shape rule where no formats are configured', () => {
    expect(companyIdMatchesAny('anything', undefined)).toBe(true);
    expect(companyIdMatchesAny('anything', [])).toBe(true);
  });
});

describe('emailField', () => {
  const field = emailField;

  it('accepts an address pasted with space around it, and keeps the trim', () => {
    expect(field.parse('  jane@example.com  ')).toBe('jane@example.com');
  });

  it('still refuses one that is not an address', () => {
    expect(field.safeParse('  not-an-address  ').success).toBe(false);
  });

  it('measures the length against the trimmed value', () => {
    const local = 'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length);
    const longest = `${local}@example.com`;

    expect(field.safeParse(`  ${longest}  `).success).toBe(true);
    expect(field.safeParse(`a${longest}`).success).toBe(false);
  });

  it('lowercases where the address is stored folded', () => {
    expect(lowercaseEmailField.parse(' Jane@Example.COM ')).toBe(
      'jane@example.com',
    );
  });
});

describe('personNameField', () => {
  it.each([
    'Jane',
    'Anne-Marie',
    "O'Brien",
    'Müller',
    'Łukasz',
    '张伟',
    'José María',
  ])('takes a name as people write it: %s', (name) => {
    expect(personNameField.safeParse(name).success).toBe(true);
    expect(isPersonName(name)).toBe(true);
  });

  // Western digits and those of other scripts alike.
  it.each(['Jane2', 'Kunde 123', 'Ali ٣'])('refuses a digit: %s', (name) => {
    expect(personNameField.safeParse(name).success).toBe(false);
    expect(isPersonName(name)).toBe(false);
  });
});

describe('storedEmailField', () => {
  // A reader stricter than the writer fails every list the row is on.
  it.each([
    'a@a.a',
    'a@a.a.a',
    'jane@example.com',
    'deleted-6f1c0c7e-0000-4000-8000-000000000000@deleted.invalid',
  ])('reads back an address the writing side accepts: %s', (address) => {
    expect(emailField.safeParse(address).success).toBe(true);
    expect(storedEmailField.safeParse(address).success).toBe(true);
  });

  it('still refuses what was never an address', () => {
    expect(storedEmailField.safeParse('not-an-address').success).toBe(false);
    expect(storedEmailField.safeParse('jane@example').success).toBe(false);
  });
});
