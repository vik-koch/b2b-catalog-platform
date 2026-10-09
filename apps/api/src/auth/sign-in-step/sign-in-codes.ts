import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNotNull, lt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { SIGN_IN_CODE_LENGTH } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { signInCodes } from '../../db/schema';
import { MAIL_TEXT, MailText } from '../../mail/mail-text';
import { signInCodeText } from '../../mail/templates/sign-in-code.template';
import { SIGN_IN_PROOF, SignInProof } from './sign-in-proof';

/** How long a code is good for. */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong entries a code survives. Three codes of three tries each leave a
 * guesser nine chances in a million per pause. */
export const CODE_MAX_ATTEMPTS = 3;
/**
 * The wait before the next code or call check, by how many have gone out: a
 * minute after the first, two after the second. Each one costs the shop
 * money, so the wait grows with them rather than with the wrong entries,
 * which are already capped per code.
 */
export const CODE_WAITS_MS = [60 * 1000, 2 * 60 * 1000] as const;
/** Codes or checks an account gets before it has to wait out the pause. */
export const CODE_MAX_SENDS = CODE_WAITS_MS.length + 1;
/** The pause after the last of them, counted from when it was sent. */
export const CODE_PAUSE_MS = 30 * 60 * 1000;

export type CodePurpose = (typeof schema.signInCodePurpose.enumValues)[number];

/** A code asked for before the account's wait is over. */
export class CodeResendLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('No new code yet');
  }
}

export type CodeCheck =
  | { result: 'ok'; purpose: CodePurpose; phone: string }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'expired' };

export type CallCheckResult =
  | { result: 'ok'; purpose: CodePurpose; phone: string }
  | { result: 'pending' }
  | { result: 'expired' };

/**
 * Where a code went, or which number a call check waits for, and how long
 * until another may be asked. `call` is the number to call and how long the
 * check stays open.
 */
export interface CodeSent {
  readonly phone: string;
  readonly resendInMs: number;
  readonly call?: { readonly callTo: string; readonly expiresInMs: number };
}

interface Recipient {
  readonly id: string;
  readonly email: string;
}

type CodeRow = typeof signInCodes.$inferSelect;

/** What a send leaves in the row: a code's hash, or a call check. */
type Proof =
  | { codeHash: string; callReference: null; callTo: null; ttlMs: number }
  | { codeHash: null; callReference: string; callTo: string; ttlMs: number };

/**
 * The code or call check an account is waiting on (FR-AUTH-12, ADR 0066). One
 * row per account, and it outlives what it holds: it remembers how many went
 * out until the pause after the last one is over, so the limits hold per
 * account however often the password is entered and whichever number is
 * named.
 */
@Injectable()
export class SignInCodes {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(SIGN_IN_PROOF) private readonly proof: SignInProof,
    @Inject(MAIL_TEXT) private readonly text: MailText,
  ) {}

  /**
   * Make sure a code or call check for this purpose is open for this number.
   * A usable one is left alone: entering the password again does not pay for
   * another. Anything else is a new one, and waits its turn.
   *
   * Throws `CodeDeliveryError` when it could not be sent or started, and
   * `CodeResendLimitError` when the account's wait is not over.
   */
  async issue(
    user: Recipient,
    phone: string,
    purpose: CodePurpose,
  ): Promise<CodeSent> {
    const now = Date.now();
    // Rows whose pause is over hold a number and a count nobody needs.
    await this.db
      .delete(signInCodes)
      .where(lt(signInCodes.sentAt, new Date(now - CODE_PAUSE_MS)));

    const row = await this.row(user.id);
    if (
      row &&
      row.phone === phone &&
      row.purpose === purpose &&
      this.usable(row, now)
    ) {
      return sentFrom(row, now);
    }
    if (row) refuseUntilDue(row, now);

    const sends = (row?.sends ?? 0) + 1;
    const values = {
      purpose,
      phone,
      ...(await this.send(user, phone, now)),
      attempts: 0,
      sends,
      sentAt: new Date(now),
    };
    const [saved] = await this.db
      .insert(signInCodes)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: signInCodes.userId, set: values })
      .returning();
    return sentFrom(saved, now);
  }

  /** A new code or check for the same number, once the wait is over. Null
   * when the account is waiting on nothing at all. */
  async resend(user: Recipient): Promise<CodeSent | null> {
    const row = await this.row(user.id);
    if (!row) return null;
    return this.issueAgain(user, row);
  }

  /**
   * Checks an entered code. The attempt is counted before the comparison, in
   * one statement, so parallel guesses cannot share an attempt. A right code
   * is spent at once, and with it the account's count of messages. A row
   * holding a call check has no code to enter, and reads as expired.
   */
  async check(userId: string, code: string): Promise<CodeCheck> {
    const [counted] = await this.db
      .update(signInCodes)
      .set({ attempts: sql`${signInCodes.attempts} + 1` })
      .where(
        and(
          eq(signInCodes.userId, userId),
          isNotNull(signInCodes.codeHash),
          gt(signInCodes.expiresAt, new Date()),
          lt(signInCodes.attempts, CODE_MAX_ATTEMPTS),
        ),
      )
      .returning();
    if (!counted?.codeHash) return { result: 'expired' };

    if (!sameHash(counted.codeHash, hashCode(code))) {
      return {
        result: 'wrong',
        attemptsLeft: CODE_MAX_ATTEMPTS - counted.attempts,
      };
    }

    await this.db.delete(signInCodes).where(eq(signInCodes.userId, userId));
    return { result: 'ok', purpose: counted.purpose, phone: counted.phone };
  }

  /**
   * Asks the provider whether the call has come. A confirmed check is spent
   * in the same statement that reads it as ours, so two tabs asking at once
   * complete one sign-in between them. One the provider ended is marked
   * expired here, so later questions need not reach the provider.
   *
   * Throws `CodeDeliveryError` when the provider cannot tell.
   */
  async checkCall(userId: string): Promise<CallCheckResult> {
    if (this.proof.kind !== 'call') return { result: 'expired' };
    const row = await this.row(userId);
    const reference = row?.callReference;
    if (!row || !reference || row.expiresAt.getTime() <= Date.now()) {
      return { result: 'expired' };
    }

    const ours = and(
      eq(signInCodes.userId, userId),
      eq(signInCodes.callReference, reference),
    );
    const status = await this.proof.check.status(reference);
    if (status === 'pending') return { result: 'pending' };
    if (status === 'expired') {
      await this.db
        .update(signInCodes)
        .set({ expiresAt: new Date() })
        .where(ours);
      return { result: 'expired' };
    }
    const [spent] = await this.db.delete(signInCodes).where(ours).returning();
    if (!spent) return { result: 'expired' };
    return { result: 'ok', purpose: spent.purpose, phone: spent.phone };
  }

  private async issueAgain(user: Recipient, row: CodeRow): Promise<CodeSent> {
    const now = Date.now();
    refuseUntilDue(row, now);
    const sends = row.sends + 1;
    const [saved] = await this.db
      .update(signInCodes)
      .set({
        ...(await this.send(user, row.phone, now)),
        attempts: 0,
        sends,
        sentAt: new Date(now),
      })
      .where(eq(signInCodes.userId, user.id))
      .returning();
    return sentFrom(saved, now);
  }

  private async row(userId: string): Promise<CodeRow | undefined> {
    const [row] = await this.db
      .select()
      .from(signInCodes)
      .where(
        and(
          eq(signInCodes.userId, userId),
          gt(signInCodes.sentAt, new Date(Date.now() - CODE_PAUSE_MS)),
        ),
      );
    return row;
  }

  /** Sends a code or starts a call check, and answers what the row keeps. */
  private async send(
    user: Recipient,
    phone: string,
    now: number,
  ): Promise<Omit<Proof, 'ttlMs'> & { expiresAt: Date }> {
    const { ttlMs, ...proof } = await this.prove(user, phone);
    return { ...proof, expiresAt: new Date(now + ttlMs) };
  }

  private async prove(user: Recipient, phone: string): Promise<Proof> {
    if (this.proof.kind === 'call') {
      const started = await this.proof.check.start({
        phone,
        email: user.email,
      });
      return {
        codeHash: null,
        callReference: started.reference,
        callTo: started.callTo,
        ttlMs: started.expiresInMs,
      };
    }
    const code = newCode();
    const sent = await this.proof.delivery.send({
      phone,
      code,
      text: signInCodeText(this.text, code),
      email: user.email,
    });
    return {
      codeHash: hashCode(sent.code),
      callReference: null,
      callTo: null,
      ttlMs: CODE_TTL_MS,
    };
  }

  /** Open, and of the kind the deployment proves by now: a row left from
   * the other kind is replaced like a spent one. */
  private usable(row: CodeRow, now: number): boolean {
    const kind = row.callReference ? 'call' : 'code';
    return (
      kind === this.proof.kind &&
      row.expiresAt.getTime() > now &&
      row.attempts < CODE_MAX_ATTEMPTS
    );
  }
}

/** What a screen is told about a row. */
function sentFrom(row: CodeRow, now: number): CodeSent {
  return {
    phone: row.phone,
    resendInMs: waitLeft(row, now),
    ...(row.callReference && row.callTo
      ? {
          call: {
            callTo: row.callTo,
            expiresInMs: Math.max(0, row.expiresAt.getTime() - now),
          },
        }
      : {}),
  };
}

/** The wait after the n-th code; the pause once there are no more. */
function waitAfter(sends: number): number {
  return CODE_WAITS_MS[sends - 1] ?? CODE_PAUSE_MS;
}

function waitLeft(row: CodeRow, now: number): number {
  return Math.max(0, row.sentAt.getTime() + waitAfter(row.sends) - now);
}

function refuseUntilDue(row: CodeRow, now: number): void {
  const left = waitLeft(row, now);
  if (left > 0) throw new CodeResendLimitError(left);
}

function newCode(): string {
  return String(randomInt(0, 10 ** SIGN_IN_CODE_LENGTH)).padStart(
    SIGN_IN_CODE_LENGTH,
    '0',
  );
}

/** SHA-256, like the password links: a code lives minutes and allows three
 * tries, so a slow hash would protect nothing the limits do not. */
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
