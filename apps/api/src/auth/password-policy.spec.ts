import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetApiDeploymentConfig } from '../config/deployment-config';
import { PasswordPolicy, PasswordRejectedError } from './password-policy';

/**
 * The policy reads the shop's name from the mounted deployment config, so the
 * spec mounts one of its own rather than depending on the workspace's relative
 * path resolving from jest's working directory.
 */
function withShopName(name: string, blocklist: string[] = []): PasswordPolicy {
  const dir = mkdtempSync(join(tmpdir(), 'policy-'));
  const config = join(dir, 'config.json');
  writeFileSync(
    config,
    JSON.stringify({ branding: { name, theme: { primary: '#000' } } }),
  );
  process.env['DEPLOYMENT_CONFIG_FILE'] = config;

  // The blocklist is deployment configuration, so the spec supplies one — a
  // few entries standing in for the published list a real deployment mounts.
  const list = join(dir, 'blocklist.txt');
  writeFileSync(list, blocklist.join('\n'));
  process.env['PASSWORD_BLOCKLIST_FILE'] = list;

  resetApiDeploymentConfig();
  return new PasswordPolicy();
}

/**
 * The rules that replace composition requirements. Each case is a password
 * that would satisfy "a digit, a symbol and a capital" and still be a bad
 * password — which is the argument for having this file at all.
 */
describe('PasswordPolicy', () => {
  const originalConfig = process.env['DEPLOYMENT_CONFIG_FILE'];
  const originalList = process.env['PASSWORD_BLOCKLIST_FILE'];
  const policy = withShopName('Coffee Kontor', [
    'password',
    'passwort',
    'letmein',
    'qwertzuiop',
    '12345678',
  ]);

  afterAll(() => {
    process.env['DEPLOYMENT_CONFIG_FILE'] = originalConfig;
    process.env['PASSWORD_BLOCKLIST_FILE'] = originalList;
    resetApiDeploymentConfig();
  });
  const check =
    (password: string, email = 'jane@example.com') =>
    () =>
      policy.assertAcceptable(password, email);

  it('accepts an ordinary passphrase', () => {
    expect(check('correct horse battery staple')).not.toThrow();
    expect(check('rainy tuesday in hamburg')).not.toThrow();
  });

  // Without a configured list there is no blocklist, only the mechanical
  // rules — the deployment decides which language's common passwords apply.
  it('applies no blocklist when the deployment configures none', () => {
    const bare = withShopName('Coffee Kontor');

    expect(() =>
      bare.assertAcceptable('password', 'jane@example.com'),
    ).not.toThrow();
  });

  it('refuses the passwords everyone tries first', () => {
    expect(check('password')).toThrow(PasswordRejectedError);
    expect(check('Qwertzuiop')).toThrow(/commonly used/i);
  });

  // A blocklist that only matches whole strings stops nobody: the first thing
  // anyone does when refused is add a number to the end.
  it('sees a blocklisted password through the decoration around it', () => {
    expect(check('password1234')).toThrow(/commonly used/i);
    expect(check('Passwort.2026')).toThrow(/commonly used/i);
    expect(check('l-e-t-m-e-i-n-!')).toThrow(/commonly used/i);
  });

  it('refuses straight runs and repetition, however long', () => {
    expect(check('345678901234')).toThrow(/too simple/i);
    expect(check('abcdefghijkl')).toThrow(/too simple/i);
    expect(check('aaaaaaaaaaaa')).toThrow(/too simple/i);
  });

  // Separators do not make a pattern less predictable. Which rule catches it —
  // the blocklist or the sequence check — is an implementation detail; being
  // refused is the requirement.
  it('sees through punctuation used as camouflage', () => {
    expect(check('1-2-3-4-5-6-7-8')).toThrow(PasswordRejectedError);
    expect(check('a.b.c.d.e.f.g.h')).toThrow(PasswordRejectedError);
  });

  // A role mailbox names a job, not a person, so refusing every password that
  // contains "admin" for admin@… is noise rather than protection.
  it('allows a generic mailbox name inside a password', () => {
    expect(check('dev-admin-password-2026', 'admin@example.com')).not.toThrow();
    expect(check('info is not my name here', 'info@example.com')).not.toThrow();
  });

  it('refuses a password containing the account address', () => {
    expect(check('jane-is-here-2026', 'jane@example.com')).toThrow(
      /email address/i,
    );
    // A short local part is not distinctive enough to forbid.
    expect(check('jo-is-here-today', 'jo@example.com')).not.toThrow();
  });

  it('refuses a password containing the shop name', () => {
    // The demo deployment is "Coffee Kontor" (config/deployment.json).
    expect(check('coffeekontor2026')).toThrow(/name of this shop/i);
  });
});
