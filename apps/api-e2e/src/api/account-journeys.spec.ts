import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { JourneyRun } from '../support/journey/journey';
import {
  accountJourneyAdapter,
  AccountJourneyContext,
} from '../journeys/accounts.adapter';
import { accountJourneys } from '../journeys/accounts.journeys';

/**
 * An account's life, walked end to end (FR-AUTH-01…06, FR-NOTIF-01/02).
 *
 * `users.spec.ts` asks whether one action is allowed and what it does to the
 * row. This suite asks what somebody *experiences* across several of them: what
 * lands in their inbox at each step — usually nothing, which is the assertion
 * — and whether the password they chose still opens the account after the shop
 * has switched it off and on again.
 *
 * The journeys are data (`journeys/accounts.journeys.ts`) and are also what
 * `docs/account-lifecycle.md` is generated from. Every step asserts the whole
 * observable state: a reading nobody mentioned is asserted unchanged, and a
 * mail nobody declared fails the step that sent it.
 */

const SUFFIX = Math.random().toString(36).slice(2, 10);
/** One address per journey: the inbox is the reading, and two journeys sharing
 * an address would each see the other's mail. */
const journeyEmail = (slug: string) =>
  `e2e-account-journey-${slug}-${SUFFIX}@example.com`;
const ADMIN = `e2e-account-journey-admin-${SUFFIX}@example.com`;
/** Long enough for the deployment's policy, and the same one throughout — the
 * `signsIn` probe asks whether *this* password opens the account. */
const PASSWORD = 'e2e-account-journey-password';

describe('the life of an account', () => {
  let client: Client;
  let adminCookie = '';

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "passwordSetAt")
       VALUES ($1, $2, 'admin', 'active', now())`,
      [ADMIN, await hash(PASSWORD)],
    );

    const res = await axios.post(
      '/auth/login',
      { email: ADMIN, password: PASSWORD },
      { validateStatus: () => true },
    );
    const cookie = (res.headers['set-cookie'] as string[] | undefined)
      ?.find((entry) => entry.startsWith('session='))
      ?.split(';')[0];
    if (!cookie) throw new Error(`admin login failed: ${res.status}`);
    adminCookie = cookie;
  });

  afterAll(async () => {
    // By id as well as by address: a journey that closed its account left a
    // tombstone behind, under an address of the platform's own making.
    const ids = walked.flatMap((context) => (context.id ? [context.id] : []));
    if (ids.length) {
      await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    }
    await client.query('DELETE FROM users WHERE email LIKE $1', [
      `e2e-account-journey-%-${SUFFIX}@example.com`,
    ]);
    await client.end();
  });

  /** Every context a journey ran against, so teardown can find the rows even
   * where the address it started from no longer names one. */
  const walked: AccountJourneyContext[] = [];

  describe.each(accountJourneys.map((journey) => [journey.title, journey]))(
    '%s',
    (_title, journey) => {
      let run: JourneyRun<AccountJourneyContext>;

      beforeAll(async () => {
        const context: AccountJourneyContext = {
          email: journeyEmail(journey.slug),
          password: PASSWORD,
          adminCookie,
        };
        walked.push(context);
        run = new JourneyRun(accountJourneyAdapter, context);
        await run.begin(journey);
      });

      // Sequential by design: each step is asserted against the state the one
      // before it left behind, which is the whole point of a journey.
      it.each(journey.steps.map((step) => [step.what, step]))(
        '%s',
        async (_what, step) => {
          await run.step(step);
        },
      );
    },
  );
});
