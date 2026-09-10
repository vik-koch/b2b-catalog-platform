import { env } from '../env';
import { MailText } from '../mail/mail-text';
import { demoMailText } from '../mail/mail-text.fixture';
import { LastAdminError, UserRow } from '../users/users.service';
import { AccountDeletion } from './account-deletion';

const row = (overrides: Partial<UserRow> = {}): UserRow =>
  ({
    id: 'u1',
    email: 'alex@example.com',
    passwordHash: 'stored-hash',
    role: 'user',
    status: 'active',
    ...overrides,
  }) as UserRow;

/** The collaborators, each a spy so the *order* of the calls is observable. */
function build(options: {
  user?: UserRow;
  passwordOk?: boolean;
  anotherAdmin?: boolean;
  mailFails?: boolean;
}) {
  const calls: string[] = [];

  const users = {
    findById: vi.fn(async () => options.user ?? row()),
    // What the shop's own notification reports (FR-NOTIF-08): read before the
    // scrub, since afterwards the orders name nobody.
    countOrders: vi.fn(async () => 3),
    countOpenOrders: vi.fn(async () => 1),
    // The last-admin rule lives inside the scrub's own transaction now, so
    // this is where the refusal comes from.
    anonymize: vi.fn(async () => {
      if (options.anotherAdmin === false) throw new LastAdminError();
      calls.push('anonymize');
      return row({ status: 'anonymized', email: 'deleted-u1@deleted.invalid' });
    }),
  };
  const passwords = {
    verify: vi.fn(async () => options.passwordOk ?? true),
    unusableHash: vi.fn(async () => 'unusable'),
  };
  const tokens = {
    revokeOutstanding: vi.fn(async () => {
      calls.push('revoke');
    }),
  };
  const mail = {
    send: vi.fn(async (_content: unknown, envelope: { to: string }) => {
      calls.push(`mail:${envelope.to}`);
      if (options.mailFails) throw new Error('smtp is down');
    }),
  };

  // The files supplied for this account's orders (ADR 0052): bytes no
  // column-level scrub can reach, so the deletion removes them itself.
  const orderDocuments = {
    removeForUser: vi.fn(async () => {
      calls.push('documents');
      return 0;
    }),
  };

  const deletion = new AccountDeletion(
    users as never,
    passwords as never,
    tokens as never,
    mail as never,
    orderDocuments as never,
    demoMailText as MailText,
  );

  return { deletion, users, passwords, tokens, mail, orderDocuments, calls };
}

describe('AccountDeletion', () => {
  it('refuses a wrong password without touching the account', async () => {
    const { deletion, users, mail } = build({ passwordOk: false });

    const result = await deletion.delete('u1', 'wrong');

    expect(result).toEqual({ ok: false, reason: 'wrong-password' });
    expect(users.anonymize).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  // Somebody has to be able to let people back in. The scrub raises it from
  // inside its own transaction, and the page hears a refusal, not a 500.
  it('refuses the last admin', async () => {
    const { deletion, calls } = build({
      user: row({ role: 'admin' }),
      anotherAdmin: false,
    });

    const result = await deletion.delete('u1', 'correct');

    expect(result).toEqual({ ok: false, reason: 'last-admin' });
    // Nothing else ran: no documents removed, no confirmation sent.
    expect(calls).toEqual([]);
  });

  it('lets an admin go while another one remains', async () => {
    const { deletion, users } = build({
      user: row({ role: 'admin' }),
      anotherAdmin: true,
    });

    expect(await deletion.delete('u1', 'correct')).toEqual({ ok: true });
    expect(users.anonymize).toHaveBeenCalled();
  });

  /**
   * The ordering constraint that is easy to get wrong: the write is what
   * overwrites the address, so the address has to be *read* first — while the
   * mail itself goes last, so a failed write never confirms a deletion that
   * did not happen.
   */
  it('mails the original address after the row has been anonymized', async () => {
    const { deletion, calls } = build({});

    await deletion.delete('u1', 'correct');

    // The documents go after the scrub and before the confirmation: they are
    // part of the deletion, and the mail only reports it. The shop's own
    // notification (FR-NOTIF-08) goes last of all — the customer is waiting on
    // a page for theirs, and nobody is waiting for the shop's.
    expect(calls).toEqual([
      'anonymize',
      'documents',
      'revoke',
      'mail:alex@example.com',
      `mail:${env.MAIL_STAFF_TO}`,
    ]);
  });

  /**
   * Both messages are attempted, and neither can take the other down: one
   * failing inbox must not swallow a message meant for a different one.
   */
  it('still tells the shop when the customer’s confirmation fails', async () => {
    const { deletion, mail } = build({ mailFails: true });

    await deletion.delete('u1', 'correct');

    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  // The deletion is the request; the mail only reports it.
  it('still deletes when the confirmation cannot be sent', async () => {
    const { deletion, users } = build({ mailFails: true });

    expect(await deletion.delete('u1', 'correct')).toEqual({ ok: true });
    expect(users.anonymize).toHaveBeenCalled();
  });

  it('revokes any outstanding password link', async () => {
    const { deletion, tokens } = build({});

    await deletion.delete('u1', 'correct');

    expect(tokens.revokeOutstanding).toHaveBeenCalledWith('u1');
  });
});
