import axios from 'axios';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';

// Scoped to this suite's own mail: the staff inbox also receives registration
// notifications from another suite running at the same time.
const INQUIRY_MAIL = `to:"${requireEnv('MAIL_STAFF_TO')}" subject:Inquiry`;

const validSubmission = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  preferredContact: 'email',
  message: 'Do you deliver to Altona?',
};

describe('POST /inquiry', () => {
  beforeEach(async () => {
    await deleteMatching(INQUIRY_MAIL);
  });

  it('accepts a valid submission and emails the shop', async () => {
    const res = await axios.post('/inquiry', validSubmission);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });

    const messages = await messagesMatching(INQUIRY_MAIL);
    expect(messages).toHaveLength(1);
    expect(messages[0].Subject).toContain('Jane Doe');
    expect(messages[0].To.map((t) => t.Address)).toContain(
      requireEnv('MAIL_STAFF_TO'),
    );
  });

  // The round trip through the real transport: what actually arrives is the
  // branded layout, with a plain-text alternative beside it.
  it('delivers both a branded HTML part and a plain-text one', async () => {
    await axios.post('/inquiry', validSubmission);

    const [message] = await messagesMatching(INQUIRY_MAIL);
    const body = await messageBody(message.ID);

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
    expect(await messagesMatching(INQUIRY_MAIL)).toHaveLength(0);
  });

  it('rejects a submission with neither email nor phone', async () => {
    const { email: _email, ...noContact } = validSubmission;
    const res = await axios.post('/inquiry', noContact, {
      validateStatus: () => true,
    });

    expect(res.status).toBe(400);
    expect(await messagesMatching(INQUIRY_MAIL)).toHaveLength(0);
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
    expect(await messagesMatching(INQUIRY_MAIL)).toHaveLength(0);
  });

  it('silently drops a submission with the honeypot filled', async () => {
    const res = await axios.post('/inquiry', {
      ...validSubmission,
      website: 'http://spam.example',
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(await messagesMatching(INQUIRY_MAIL)).toHaveLength(0);
  });
});
