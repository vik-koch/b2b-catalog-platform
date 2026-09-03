import { addressConfigSchema } from './address-config';

describe('addressConfigSchema', () => {
  it('refuses a pattern that is not anchored to the whole value', () => {
    const result = addressConfigSchema.safeParse({
      countries: [
        {
          code: 'DE',
          label: 'Germany',
          postalCode: { pattern: '[0-9]{5}', example: '20457' },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  // A hint that teaches a value the field will reject is worse than no hint.
  it('refuses an example its own pattern would not accept', () => {
    const result = addressConfigSchema.safeParse({
      countries: [
        {
          code: 'DE',
          label: 'Germany',
          postalCode: { pattern: '^[0-9]{5}$', example: '204' },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('refuses a mask that asks for anything but digits', () => {
    const result = addressConfigSchema.safeParse({
      countries: [
        {
          code: 'DE',
          label: 'Germany',
          postalCode: {
            pattern: '^[0-9]{5}$',
            example: '20457',
            mask: 'AA###',
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
