import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
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
  const original = process.env['CONFIG_PATH'];
  let dir: string;

  const write = (name: string, contents: string) => {
    writeFileSync(join(dir, name), contents);
    return name;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'load-config-'));
    process.env['CONFIG_PATH'] = dir;
  });

  afterEach(() => {
    if (original === undefined) delete process.env['CONFIG_PATH'];
    else process.env['CONFIG_PATH'] = original;
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads and validates a complete config file', () => {
    const file = write('config.json', JSON.stringify(complete));
    expect(loadConfig(schema, file)).toEqual(complete);
  });

  it('throws when CONFIG_PATH is unset — no built-in default', () => {
    const file = write('config.json', JSON.stringify(complete));
    delete process.env['CONFIG_PATH'];
    expect(() => loadConfig(schema, file)).toThrow(/CONFIG_PATH/);
  });

  it('throws when the file is missing', () => {
    expect(() => loadConfig(schema, 'does-not-exist.json')).toThrow();
  });

  it('throws on invalid JSON', () => {
    const file = write('broken.json', '{ not json');
    expect(() => loadConfig(schema, file)).toThrow();
  });

  it('throws on a missing required key rather than filling a default', () => {
    // cookieConsentEnabled omitted — no merge fills it, so validation fails.
    const file = write(
      'partial.json',
      JSON.stringify({
        branding: complete.branding,
        locations: complete.locations,
      }),
    );
    expect(() => loadConfig(schema, file)).toThrow();
  });

  it('throws on an unknown key (a typo in the config file)', () => {
    const file = write(
      'typo.json',
      JSON.stringify({ ...complete, branding: { naem: 'x' } }),
    );
    expect(() => loadConfig(schema, file)).toThrow();
  });

  it('throws on a value of the wrong type', () => {
    const file = write(
      'wrong.json',
      JSON.stringify({ ...complete, cookieConsentEnabled: 'yes' }),
    );
    expect(() => loadConfig(schema, file)).toThrow();
  });
});
