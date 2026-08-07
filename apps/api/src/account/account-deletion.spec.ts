import { MailText } from '../mail/mail-text';
import { demoMailText } from '../mail/mail-text.fixture';
import { UserRow } from '../users/users.service';
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
    findById: jest.fn(async () => options.user ?? row()),
    hasAnotherAdmin: jest.fn(async () => options.anotherAdmin ?? true),
    anonymize: jest.fn(async () => {
      calls.push('anonymize');
      return row({ status: 'anonymized', email: 'deleted-u1@invalid' });
    }),
  };
  const passwords = {
    verify: jest.fn(async () => options.passwordOk ?? true),
    unusableHash: jest.fn(async () => 'unusable'),
  };
  const tokens = {
    revokeOutstanding: jest.fn(async () => {
      calls.push('revoke');
    }),
  };
  const mail = {
    send: jest.fn(async (_content: unknown, envelope: { to: string }) => {
      calls.push(`mail:${envelope.to}`);
      if (options.mailFails) throw new Error('smtp is down');
    }),
  };

  const deletion = new AccountDeletion(
    users as never,
    passwords as never,
    tokens as never,
    mail as never,
    demoMailText as MailText,
  );

  return { deletion, users, passwords, tokens, mail, calls };
}

describe('AccountDeletion', () => {
  it('refuses a wrong password without touching the account', async () => {
    const { deletion, users, mail } = build({ passwordOk: false });

    const result = await deletion.delete('u1', 'wrong');

    expect(result).toEqual({ ok: false, reason: 'wrong-password' });
    expect(users.anonymize).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  // Somebody has to be able to let people back in.
  it('refuses the last admin', async () => {
    const { deletion, users } = build({
      user: row({ role: 'admin' }),
      anotherAdmin: false,
    });

    const result = await deletion.delete('u1', 'correct');

    expect(result).toEqual({ ok: false, reason: 'last-admin' });
    expect(users.anonymize).not.toHaveBeenCalled();
  });

  it('lets an admin go while another one remains', async () => {
    const { deletion, users } = build({
      user: row({ role: 'admin' }),
      anotherAdmin: true,
    });

    expect(await deletion.delete('u1', 'correct')).toEqual({ ok: true });
    expect(users.anonymize).toHaveBeenCalled();
  });

  // A customer is never asked the admin question at all.
  it('does not consult the admin rule for a customer', async () => {
    const { deletion, users } = build({});

    await deletion.delete('u1', 'correct');

    expect(users.hasAnotherAdmin).not.toHaveBeenCalled();
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

    expect(calls).toEqual(['anonymize', 'revoke', 'mail:alex@example.com']);
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
