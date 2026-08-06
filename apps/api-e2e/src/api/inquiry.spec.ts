import axios from 'axios';
import { requireEnv } from '../support/env';

// Mailpit's REST API (see compose.db.yml) — the dev/e2e email sink.
const mailpit = axios.create({ baseURL: 'http://localhost:8025/api/v1' });

interface CaughtMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

async function caughtMessages(): Promise<CaughtMessage[]> {
  const res = await mailpit.get('/messages');
  return res.data.messages as CaughtMessage[];
}

/** The delivered body, as the recipient's client would receive both parts. */
async function caughtBody(id: string): Promise<{ HTML: string; Text: string }> {
  const res = await mailpit.get(`/message/${id}`);
  return res.data as { HTML: string; Text: string };
}

const validSubmission = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  preferredContact: 'email',
  message: 'Do you deliver to Altona?',
};

describe('POST /inquiry', () => {
  beforeEach(async () => {
    await mailpit.delete('/messages');
  });

  it('accepts a valid submission and emails the shop', async () => {
    const res = await axios.post('/inquiry', validSubmission);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });

    const messages = await caughtMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].Subject).toContain('Jane Doe');
    expect(messages[0].To.map((t) => t.Address)).toContain(
      requireEnv('MAIL_CONTACT_TO'),
    );
  });

  // The round trip through the real transport: what actually arrives is the
  // branded layout, with a plain-text alternative beside it.
  it('delivers both a branded HTML part and a plain-text one', async () => {
    await axios.post('/inquiry', validSubmission);

    const [message] = await caughtMessages();
    const body = await caughtBody(message.ID);

    expect(body.HTML).toContain('Do you deliver to Altona?');
    expect(body.HTML).toContain('<table');
    expect(body.Text).toContain('Do you deliver to Altona?');
    expect(body.Text).not.toContain('<table');
  });

  it('rejects a submission without a name', async () => {
    const res = await axios.post(
      '/inquiry',
      { ...validSubmission, name: '' },
      { validateStatus: () => true },
    );

    expect(res.status).toBe(400);
    expect(await caughtMessages()).toHaveLength(0);
  });

  it('rejects a submission with neither email nor phone', async () => {
    const { email: _email, ...noContact } = validSubmission;
    const res = await axios.post('/inquiry', noContact, {
      validateStatus: () => true,
    });

    expect(res.status).toBe(400);
    expect(await caughtMessages()).toHaveLength(0);
  });

  // Honeypot: a filled decoy field looks like success to the bot
  // (a normal 200) but no mail is sent.
  it('rejects an unknown field on the submission (strict contract)', async () => {
    const res = await axios.post(
      '/inquiry',
      { ...validSubmission, sneaky: true },
      { validateStatus: () => true },
    );

    expect(res.status).toBe(400);
    expect(await caughtMessages()).toHaveLength(0);
  });

  it('silently drops a submission with the honeypot filled', async () => {
    const res = await axios.post('/inquiry', {
      ...validSubmission,
      website: 'http://spam.example',
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(await caughtMessages()).toHaveLength(0);
  });
});
