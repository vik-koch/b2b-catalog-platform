import axios from 'axios';
import { Client } from 'pg';
import { consentVersion } from '../support/consent';
import { requireEnv } from '../support/env';
import { deleteMatching, messagesMatching } from '../support/mailpit';

const NEW_EMAIL = 'e2e-registrant@example.com';
const KNOWN_EMAIL = 'e2e-known-registrant@example.com';

// Scoped to this suite's own mail — the staff inbox receives inquiries and
// other suites' registrations at the same time. The staff query therefore names
// the applicant as well as the subject: the notification lists everything they
// submitted, so their address is in the body, and without it a registration
// from another suite is one of "our" messages.
const REGISTRANT_MAIL = `to:"${NEW_EMAIL}"`;
const staffMailAbout = (email: string) =>
  `to:"${requireEnv('MAIL_STAFF_TO')}" subject:"New registration" "${email}"`;
const STAFF_MAIL = staffMailAbout(NEW_EMAIL);
// Separate queries, never one combined: Mailpit's search has no OR and no
// grouping, and a parenthesised query silently matches nothing — which would
// make every "no mail was sent" assertion below pass for the wrong reason.
const OUR_MAIL = [REGISTRANT_MAIL, STAFF_MAIL, staffMailAbout(KNOWN_EMAIL)];

const clearOurMail = () => Promise.all(OUR_MAIL.map(deleteMatching));

/** Asserts this suite's registration produced no mail of either kind. */
async function expectNoMail(): Promise<void> {
  for (const query of OUR_MAIL) {
    expect(await messagesMatching(query)).toHaveLength(0);
  }
}

/** Ticks the consent box the form would show, unless the body says otherwise. */
const register = async (body: object) =>
  axios.post(
    '/auth/register',
    { consentVersion: await consentVersion('account'), ...body },
    { validateStatus: () => true },
  );

/** A complete private-person registration; specs override what they test. */
const person = {
  email: NEW_EMAIL,
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+49 40 1234567',
  customerType: 'person',
};
// The demo deployment's format is a German VAT number: DE + nine digits.
const company = {
  ...person,
  customerType: 'company',
  companyName: 'Kontor GmbH',
  companyRegistrationId: 'DE123456789',
};

/**
 * FR-AUTH-01 end to end. The rule under test throughout: the response is the
 * same whatever happened, and what actually happened shows up in the database
 * and the mail sink instead.
 */
describe('POST /auth/register', () => {
  let client: Client;

  const rowsFor = async (email: string) => {
    const { rows } = await client.query(
      `SELECT status, role, "tierId", "approvedAt", "firstName", "lastName",
              phone, "customerType", "companyName", "companyRegistrationId"
         FROM users WHERE email = $1`,
      [email],
    );
    return rows;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [NEW_EMAIL, KNOWN_EMAIL],
    ]);
    // An address that already has an account, for the no-enumeration case.
    // Deliberately staff: suites share one database and run in parallel, and a
    // long-lived customer row would drift the account counts another suite
    // asserts. Registration does not care what role the existing account has.
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'manager', 'active')`,
      [KNOWN_EMAIL, '$argon2id$placeholder'],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [NEW_EMAIL, KNOWN_EMAIL],
    ]);
    await client.query('DELETE FROM consents WHERE email = $1', [NEW_EMAIL]);
    await client.end();
  });

  beforeEach(async () => {
    await clearOurMail();
    await client.query('DELETE FROM users WHERE email = $1', [NEW_EMAIL]);
    await client.query('DELETE FROM consents WHERE email = $1', [NEW_EMAIL]);
  });

  it('creates a pending, untiered account and mails the registrant and the shop', async () => {
    const res = await register(person);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });

    // Everything the approving manager needs is on the row, and nothing that
    // only approval may set (tier, approvedAt) is.
    expect(await rowsFor(NEW_EMAIL)).toEqual([
      {
        status: 'pending',
        role: 'user',
        tierId: null,
        approvedAt: null,
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+49 40 1234567',
        customerType: 'person',
        companyName: null,
        companyRegistrationId: null,
      },
    ]);

    expect(await messagesMatching(REGISTRANT_MAIL)).toHaveLength(1);
    expect(await messagesMatching(STAFF_MAIL)).toHaveLength(1);
  });

  // The account exists but is not usable yet: approval is what makes it one.
  it('leaves the new account unable to sign in', async () => {
    await register(person);

    const res = await axios.post(
      '/auth/login',
      { email: NEW_EMAIL, password: 'anything-at-all' },
      { validateStatus: () => true },
    );

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('answers a known address identically, without a second row or a mail', async () => {
    const res = await register({ ...person, email: KNOWN_EMAIL });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(await rowsFor(KNOWN_EMAIL)).toHaveLength(1);
    await expectNoMail();
  });

  it('normalizes the address, so a differently-cased retry is not a new account', async () => {
    await register(person);
    await register({ ...person, email: NEW_EMAIL.toUpperCase() });

    expect(await rowsFor(NEW_EMAIL)).toHaveLength(1);
  });

  it('silently drops a submission with the honeypot filled', async () => {
    const res = await register({ ...person, website: 'http://spam.example' });

    expect(res.status).toBe(200);
    expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
    await expectNoMail();
  });

  it('rejects a malformed address with a 400 and writes nothing', async () => {
    const res = await register({ ...person, email: 'not-an-address' });

    expect(res.status).toBe(400);
    await expectNoMail();
  });

  it('stores both halves of the invoiced party', async () => {
    const res = await register(company);

    expect(res.status).toBe(200);
    const [row] = await rowsFor(NEW_EMAIL);
    expect(row.customerType).toBe('company');
    expect(row.companyName).toBe('Kontor GmbH');
    expect(row.companyRegistrationId).toBe('DE123456789');
  });

  // Typed the way it is printed on a letterhead; the contract normalizes it, so
  // what is stored is what the deployment's patterns are written against.
  it('normalizes a number typed with spaces', async () => {
    const res = await register({
      ...company,
      companyRegistrationId: 'de 123 456 789',
    });

    expect(res.status).toBe(200);
    const [row] = await rowsFor(NEW_EMAIL);
    expect(row.companyRegistrationId).toBe('DE123456789');
  });

  // The format is deployment configuration, so the contract cannot check it —
  // the API applies the deployment's own pattern on top.
  it('rejects a number the deployment pattern refuses', async () => {
    const res = await register({
      ...company,
      companyRegistrationId: 'DE12345',
    });

    expect(res.status).toBe(400);
    expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
    await expectNoMail();
  });

  it('refuses a company with no number, and a person carrying one', async () => {
    const { companyRegistrationId: _omitted, ...noNumber } = company;
    expect((await register(noNumber)).status).toBe(400);
    expect(
      (await register({ ...person, companyRegistrationId: 'DE123456789' }))
        .status,
    ).toBe(400);
    expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
  });

  // Both halves, by the same rule: staff approve on the pair, and a name
  // against a private person is a company detail nobody asked for.
  it('refuses a company with no name, and a person carrying one', async () => {
    const { companyName: _omitted, ...noName } = company;
    expect((await register(noName)).status).toBe(400);
    expect(
      (await register({ ...person, companyName: 'Kontor GmbH' })).status,
    ).toBe(400);
    expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
  });

  // FR-AUTH-10, end to end: the address of the company the registrant picked
  // becomes the account's first saved one.
  it('seeds the first address from a picked company', async () => {
    const res = await register({
      ...company,
      billingAddress: {
        entityType: 'legal',
        street: 'Hafenstraße 12',
        postalCode: '20359',
        city: 'Hamburg',
        country: 'DE',
      },
    });

    expect(res.status).toBe(200);
    const { rows } = await client.query(
      `SELECT a.label, a.street, a."postalCode", a.city
         FROM addresses a JOIN users u ON u.id = a."userId"
        WHERE u.email = $1`,
      [NEW_EMAIL],
    );
    expect(rows).toEqual([
      {
        // Unnamed: nobody asked the customer to label it. Nor is the company
        // named on it — an address is a place, and the account already carries
        // who was registered.
        label: null,
        street: 'Hafenstraße 12',
        postalCode: '20359',
        city: 'Hamburg',
      },
    ]);
  });

  // An individual entrepreneur's registered address is their home, and the
  // rule is the server's, not the form's.
  it('seeds nothing from an individual’s registered address', async () => {
    const res = await register({
      ...company,
      billingAddress: {
        entityType: 'individual',
        street: 'Hafenstraße 12',
        postalCode: '20359',
        city: 'Hamburg',
        country: 'DE',
      },
    });

    expect(res.status).toBe(200);
    const { rows } = await client.query(
      `SELECT a.id FROM addresses a JOIN users u ON u.id = a."userId"
        WHERE u.email = $1`,
      [NEW_EMAIL],
    );
    expect(rows).toHaveLength(0);
  });

  it('rejects an unknown field on the submission (strict contract)', async () => {
    const res = await register({ ...person, role: 'admin' });

    expect(res.status).toBe(400);
    expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
  });

  describe('consent (NFR-LEGAL-09)', () => {
    const recordsFor = async (email: string) =>
      (
        await client.query(
          `SELECT c.purpose, c."userId" = u.id AS "ofTheAccount", c.email,
                  v.slug, v.version
             FROM consents c
             JOIN page_versions v ON v.id = c."pageVersionId"
             LEFT JOIN users u ON u.email = c.email
            WHERE c.email = $1`,
          [email],
        )
      ).rows;

    it('records the consent against the new account and the version shown', async () => {
      const res = await register(person);

      expect(res.status).toBe(200);
      expect(await recordsFor(NEW_EMAIL)).toEqual([
        {
          purpose: 'account',
          ofTheAccount: true,
          email: NEW_EMAIL,
          slug: 'consent-account',
          version: await consentVersion('account'),
        },
      ]);
    });

    it('refuses an unticked box before anything is written or mailed', async () => {
      const res = await register({ ...person, consentVersion: undefined });

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('consent-required');
      expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
      await expectNoMail();
    });

    // Refused the same way for a known address: the refusal comes before the
    // lookup, so it says nothing about who has an account.
    it('refuses a stale version alike for a new and a known address', async () => {
      const stale = (await consentVersion('account')) + 1;

      const fresh = await register({ ...person, consentVersion: stale });
      const known = await register({
        ...person,
        email: KNOWN_EMAIL,
        consentVersion: stale,
      });

      expect([fresh.status, known.status]).toEqual([409, 409]);
      expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
    });

    it('records nothing for an address that already has an account', async () => {
      await register({ ...person, email: KNOWN_EMAIL });

      expect(await recordsFor(KNOWN_EMAIL)).toHaveLength(0);
    });
  });
});
