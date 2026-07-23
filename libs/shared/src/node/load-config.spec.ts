import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig } from './load-config';

// A miniature stand-in for a real config schema: enough shape to exercise the
// load path (nested object, array, optional field, strict typo catch).
const schema = z
  .object({
    branding: z.object({ name: z.string(), logo: z.string() }).strict(),
    cookieConsentEnabled: z.boolean(),
    locations: z.array(z.object({ name: z.string() }).strict()),
    contact: z
      .object({ phone: z.string().optional(), email: z.string().optional() })
      .strict()
      .optional(),
  })
  .strict();

const complete = {
  branding: { name: 'Real Shop', logo: '/logo.svg' },
  cookieConsentEnabled: true,
  locations: [{ name: 'Berlin' }],
};

describe('loadConfig', () => {
  const ENV_VAR = 'TEST_CONFIG_FILE';
  let dir: string;

  const write = (name: string, contents: string) => {
    const file = join(dir, name);
    writeFileSync(file, contents);
    process.env[ENV_VAR] = file;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'load-config-'));
  });

  afterEach(() => {
    delete process.env[ENV_VAR];
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads and validates a complete config file', () => {
    write('config.json', JSON.stringify(complete));
    expect(loadConfig(schema, ENV_VAR)).toEqual(complete);
  });

  it('throws when the env var is unset — no built-in default', () => {
    delete process.env[ENV_VAR];
    expect(() => loadConfig(schema, ENV_VAR)).toThrow();
  });

  it('throws when the file is missing', () => {
    process.env[ENV_VAR] = join(dir, 'does-not-exist.json');
    expect(() => loadConfig(schema, ENV_VAR)).toThrow();
  });

  it('throws on invalid JSON', () => {
    write('broken.json', '{ not json');
    expect(() => loadConfig(schema, ENV_VAR)).toThrow();
  });

  it('throws on a missing required key rather than filling a default', () => {
    // cookieConsentEnabled omitted — no merge fills it, so validation fails.
    write(
      'partial.json',
      JSON.stringify({
        branding: complete.branding,
        locations: complete.locations,
      }),
    );
    expect(() => loadConfig(schema, ENV_VAR)).toThrow();
  });

  it('throws on an unknown key (a typo in the config file)', () => {
    write(
      'typo.json',
      JSON.stringify({ ...complete, branding: { naem: 'x' } }),
    );
    expect(() => loadConfig(schema, ENV_VAR)).toThrow();
  });

  it('throws on a value of the wrong type', () => {
    write(
      'wrong.json',
      JSON.stringify({ ...complete, cookieConsentEnabled: 'yes' }),
    );
    expect(() => loadConfig(schema, ENV_VAR)).toThrow();
  });
});
