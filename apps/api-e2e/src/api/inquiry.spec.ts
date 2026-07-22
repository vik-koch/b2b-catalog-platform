import axios from 'axios';
import { requireEnv } from '../support/env';

// Mailpit's REST API (see compose.db.yml) — the dev/e2e email sink.
const mailpit = axios.create({ baseURL: 'http://localhost:8025/api/v1' });

interface CaughtMessage {
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

async function caughtMessages(): Promise<CaughtMessage[]> {
  const res = await mailpit.get('/messages');
  return res.data.messages as CaughtMessage[];
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
});
