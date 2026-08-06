import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { loadApiDeploymentConfig } from '../config/deployment-config';

/**
 * Common-password blocklist (NIST 800-63B §5.1.1.2, OWASP ASVS V2.1.7): the
 * check that actually stops `hallo123`, where composition rules ("must contain
 * a digit and a symbol") stop nothing — `Passwort1!` satisfies every such rule
 * and is on every published list.
 *
 * The list itself is **deployment configuration, not code**: which passwords
 * are common depends on the language the deployment's customers think in, and
 * a list baked into this repo would either be English-only or an arbitrary mix.
 * A deployment points PASSWORD_BLOCKLIST_FILE at a newline-separated file (a
 * published top-N list, or one from its own locale) and gets it applied; a
 * deployment that configures none is left with the rules below, which are
 * mechanical and language-independent.
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

/**
 * A password the policy refuses, carrying the reason in words the form shows
 * verbatim. Its own type rather than a BadRequestException, because the two
 * endpoints that set passwords answer it differently — and because
 * change-password already has a *different* 400 ("wrong current password") that
 * callers must be able to tell apart.
 */
export class PasswordRejectedError extends Error {}

/**
 * Mailbox names that identify a role rather than a person. Refusing every
 * password containing "admin" for the account `admin@shop.example` is noise:
 * the rule exists so nobody builds a password out of *their own name*, and a
 * shared role mailbox has none.
 */
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

/** Non-alphanumerics stripped and digits/letters folded, for matching. */
const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const isSequence = (value: string): boolean =>
  value.length >= 4 && SEQUENCES.some((run) => run.includes(value));

const isRepetition = (value: string): boolean =>
  new Set(value).size <= 2 && value.length >= 4;

/**
 * What a password may not be (NFR-SEC-02). The *length* rule lives in the
 * shared contract, so the browser enforces the same floor; everything here is
 * server-side, because it depends on data the contract has no business knowing
 * — a blocklist, the shop's name, and the address of the account in question.
 */
@Injectable()
export class PasswordPolicy {
  /** Read once at boot; an unreadable path fails the startup, not every login. */
  private readonly blocklist = loadBlocklist();

  /** The deployment's own name, so "coffeekontor2026" is refused as well. */
  private readonly shopName = normalize(
    loadApiDeploymentConfig().branding.name,
  );

  /**
   * A blocklist that only matches whole strings is trivially defeated by the
   * first thing anyone tries: `password` is refused, `password1234` is not.
   * So the candidate is also checked with its trailing digits stripped, and
   * with everything but its letters removed — which covers `Password.2026`,
   * `p-a-s-s-w-o-r-d` and the rest of the same idea.
   */
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

  /**
   * Throws with a message the form can show verbatim. Each refusal says what
   * is wrong rather than restating the rules, so somebody who typed their own
   * email address is told that, not "invalid password".
   */
  assertAcceptable(password: string, email: string): void {
    const normalized = normalize(password);

    if (this.isCommon(password, normalized)) {
      throw new PasswordRejectedError(
        'That is one of the most commonly used passwords. Please choose something less predictable.',
      );
    }
    if (isSequence(normalized) || isRepetition(normalized)) {
      throw new PasswordRejectedError(
        'That is too simple a pattern. Please choose something less predictable.',
      );
    }

    const localPart = normalize(email.split('@')[0] ?? '');
    if (
      localPart.length >= 4 &&
      !GENERIC_MAILBOXES.has(localPart) &&
      normalized.includes(localPart)
    ) {
      throw new PasswordRejectedError(
        'Please choose a password that does not contain your email address.',
      );
    }
    if (this.shopName.length >= 4 && normalized.includes(this.shopName)) {
      throw new PasswordRejectedError(
        'Please choose a password that does not contain the name of this shop.',
      );
    }
  }
}
