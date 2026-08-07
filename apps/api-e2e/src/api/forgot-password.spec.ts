import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';

const SUFFIX = Math.random().toString(36).slice(2, 10);
const ACTIVE_EMAIL = `e2e-forgot-active-${SUFFIX}@example.com`;
const INVITED_EMAIL = `e2e-forgot-invited-${SUFFIX}@example.com`;
const PENDING_EMAIL = `e2e-forgot-pending-${SUFFIX}@example.com`;
const DISABLED_EMAIL = `e2e-forgot-disabled-${SUFFIX}@example.com`;
const UNKNOWN_EMAIL = `e2e-forgot-nobody-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-forgot-password';

const seeded = [ACTIVE_EMAIL, INVITED_EMAIL, PENDING_EMAIL, DISABLED_EMAIL];

const ask = (email: unknown) =>
  axios.post(
    '/auth/forgot-password',
    { email },
    { validateStatus: () => true },
  );

/** The link out of the mail, as the recipient would click it. */
const tokenFrom = (html: string): string => {
  const match = /\/set-password\?token=([\w-]+)/.exec(html);
  if (!match) throw new Error('no set-password link in the mail');
  return match[1];
};

/**
 * FR-AUTH-02. Two things are being tested at once: that somebody locked out
 * gets back in, and that nobody learns from the form which addresses have
 * accounts — the answer is the same every time, so the difference is only ever
 * in what arrives (or does not) in a mailbox.
 */
describe('/auth/forgot-password', () => {
  let client: Client;

  const seedUser = async (email: string, status: string) => {
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'user', $3)`,
      [email, await hash(PASSWORD), status],
    );
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    await client.query('DELETE FROM users WHERE email = ANY($1)', [seeded]);

    await seedUser(ACTIVE_EMAIL, 'active');
    await seedUser(INVITED_EMAIL, 'invited');
    await seedUser(PENDING_EMAIL, 'pending');
    await seedUser(DISABLED_EMAIL, 'disabled');
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [seeded]);
    await client.end();
  });

  beforeEach(async () => {
    for (const email of [...seeded, UNKNOWN_EMAIL]) {
      await deleteMatching(email);
    }
  });

  it('answers the same for a known address, an unknown one and a locked one', async () => {
    const answers = await Promise.all([
      ask(ACTIVE_EMAIL),
      ask(UNKNOWN_EMAIL),
      ask(PENDING_EMAIL),
      ask(DISABLED_EMAIL),
    ]);

    expect(answers.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(answers.map((r) => r.data)).toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
  });

  it('refuses a body that is not an address', async () => {
    expect((await ask('not-an-address')).status).toBe(400);
  });

  it('mails an active account a link that sets a new password', async () => {
    await ask(ACTIVE_EMAIL);

    const messages = await messagesMatching(ACTIVE_EMAIL);
    expect(messages).toHaveLength(1);
    const body = await messageBody(messages[0].ID);
    const token = tokenFrom(body.HTML);

    // The link describes itself as a reset, because the account has a password.
    const described = await axios.get(`/auth/password-token/${token}`, {
      validateStatus: () => true,
    });
    expect(described.status).toBe(200);
    expect(described.data).toEqual({ purpose: 'reset', email: ACTIVE_EMAIL });
  });

  it('lets the link actually replace the password', async () => {
    await ask(ACTIVE_EMAIL);
    const [message] = await messagesMatching(ACTIVE_EMAIL);
    const token = tokenFrom((await messageBody(message.ID)).HTML);

    const NEW_PASSWORD = 'e2e-forgot-chosen-password';
    const set = await axios.post(
      '/auth/set-password',
      { token, password: NEW_PASSWORD },
      { validateStatus: () => true },
    );
    expect(set.status).toBe(200);

    const login = await axios.post(
      '/auth/login',
      { email: ACTIVE_EMAIL, password: NEW_PASSWORD },
      { validateStatus: () => true },
    );
    expect(login.status).toBe(200);

    // And the old one is genuinely gone.
    const old = await axios.post(
      '/auth/login',
      { email: ACTIVE_EMAIL, password: PASSWORD },
      { validateStatus: () => true },
    );
    expect(old.status).toBe(401);
  });

  /**
   * An invited account has no password to reset — what it is missing is the
   * invitation. Without this, an expired invitation is a dead end, since the
   * staff resend is the only other way to get one.
   */
  it('sends an invited account its invitation instead', async () => {
    await ask(INVITED_EMAIL);

    const messages = await messagesMatching(INVITED_EMAIL);
    expect(messages).toHaveLength(1);
    const token = tokenFrom((await messageBody(messages[0].ID)).HTML);

    const described = await axios.get(`/auth/password-token/${token}`, {
      validateStatus: () => true,
    });
    // `set`, not `reset`: this account is choosing a first password.
    expect(described.data).toEqual({ purpose: 'set', email: INVITED_EMAIL });
  });

  it('mails nothing to an account that may not sign in', async () => {
    await Promise.all([ask(PENDING_EMAIL), ask(DISABLED_EMAIL)]);

    expect(await messagesMatching(PENDING_EMAIL)).toHaveLength(0);
    expect(await messagesMatching(DISABLED_EMAIL)).toHaveLength(0);
  });

  it('mails nothing to an address with no account', async () => {
    await ask(UNKNOWN_EMAIL);

    expect(await messagesMatching(UNKNOWN_EMAIL)).toHaveLength(0);
  });

  // Asking twice must not leave two working links: the older one could be the
  // one that was forwarded, or read over a shoulder.
  it('retires the previous link when a second is asked for', async () => {
    await ask(ACTIVE_EMAIL);
    const first = tokenFrom(
      (await messageBody((await messagesMatching(ACTIVE_EMAIL))[0].ID)).HTML,
    );

    await deleteMatching(ACTIVE_EMAIL);
    await ask(ACTIVE_EMAIL);

    const stale = await axios.get(`/auth/password-token/${first}`, {
      validateStatus: () => true,
    });
    expect(stale.status).toBe(404);
  });
});
