import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { loadApiDeploymentConfig } from '../../platform/config/deployment-config';
import { PasswordRejectedError } from './password-rejected-error';

/**
 * The common-password blocklist (NIST 800-63B §5.1.1.2), where composition
 * rules stop nothing: `Passwort1!` passes them all. Deployment config, since
 * which passwords are common depends on the customers' language; without
 * one, only the mechanical rules below apply.
 */
function loadBlocklist(): ReadonlySet<string> {
  const path = process.env['PASSWORD_BLOCKLIST_FILE'];
  if (!path) return new Set();

  return new Set(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      // Blank lines and `#` comments, so the mounted file can explain itself.
      .filter((line) => line.length > 0 && !line.startsWith('#')),
  );
}

/** Role mailboxes, which name nobody: refusing "admin" in the password of
 * `admin@shop.example` would be noise. */
const GENERIC_MAILBOXES = new Set([
  'admin',
  'administrator',
  'info',
  'office',
  'kontakt',
  'contact',
  'mail',
  'email',
  'shop',
  'sales',
  'support',
  'service',
  'hallo',
  'hello',
  'user',
  'test',
  'demo',
  'noreply',
]);

/** Straight runs a keyboard or a counter produces: 12345678, abcdefgh. */
const SEQUENCES = [
  '01234567890123456789',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiopasdfghjklzxcvbnm',
  'qwertzuiopasdfghjklyxcvbnm',
];

/** Lowercase letters and digits only, for matching. */
const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const isSequence = (value: string): boolean =>
  value.length >= 4 && SEQUENCES.some((run) => run.includes(value));

const isRepetition = (value: string): boolean =>
  new Set(value).size <= 2 && value.length >= 4;

/** What a password may not be (NFR-SEC-02). The length rule is the
 * contract's; these need a blocklist, the shop's name and the account. */
@Injectable()
export class PasswordPolicy {
  /** Read once at boot; an unreadable path fails the startup, not every login. */
  private readonly blocklist = loadBlocklist();

  /** So "coffeekontor2026" is refused as well. */
  private readonly shopName = normalize(
    loadApiDeploymentConfig().branding.name,
  );

  /** Also without trailing digits and with letters only, so `password1234`,
   * `Password.2026` and `p-a-s-s-w-o-r-d` match `password`. */
  private isCommon(password: string, normalized: string): boolean {
    const candidates = [
      password.toLowerCase(),
      normalized,
      normalized.replace(/\d+$/, ''),
      normalized.replace(/[^a-z]/g, ''),
    ];
    return candidates.some(
      (candidate) => candidate.length > 0 && this.blocklist.has(candidate),
    );
  }

  /** Throws with the code of the rule that refused, so the form says what is
   * wrong rather than restating the rules. */
  assertAcceptable(password: string, email: string): void {
    const normalized = normalize(password);

    if (this.isCommon(password, normalized)) {
      throw new PasswordRejectedError(
        'password-common',
        'Password is on the common-password blocklist',
      );
    }
    if (isSequence(normalized) || isRepetition(normalized)) {
      throw new PasswordRejectedError(
        'password-predictable',
        'Password is a sequence or a repetition',
      );
    }

    const localPart = normalize(email.split('@')[0] ?? '');
    if (
      localPart.length >= 4 &&
      !GENERIC_MAILBOXES.has(localPart) &&
      normalized.includes(localPart)
    ) {
      throw new PasswordRejectedError(
        'password-contains-email',
        'Password contains the mailbox name of its own account',
      );
    }
    if (this.shopName.length >= 4 && normalized.includes(this.shopName)) {
      throw new PasswordRejectedError(
        'password-contains-shop-name',
        "Password contains the deployment's own name",
      );
    }
  }
}
