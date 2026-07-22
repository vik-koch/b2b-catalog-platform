import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { localtestEnv, MAILPIT_API } from './support/localtest';

// Mailpit's REST API returns these fields per caught message (see the api-e2e
// inquiry spec for the low-level equivalent against the same sink).
interface CaughtMessage {
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

// Where the api sends inquiries in the localtest stack (see .env.localtest).
const contactTo = localtestEnv()['MAIL_CONTACT_TO'];

// FR-NAV-06 — end-to-end proof that filling and submitting the inquiry page
// delivers an email to the shop, exercising the real web -> api -> SMTP path
// against Mailpit, not a mocked mailer.
test('submitting the inquiry form delivers an email to the shop', async ({
  page,
  request,
}) => {
  // A per-run token keeps the Mailpit assertion isolated: the mobile-chrome
  // project runs this same spec against the same sink in parallel, so we search
  // for our own message instead of clearing shared state and counting. Hyphens
  // are stripped — Mailpit's search reads a leading '-' as term exclusion.
  const name = `Jane Doe ${randomUUID().replaceAll('-', '')}`;

  await page.goto('/inquiry');

  await page.locator('#name').fill(name);
  // 'By email' is the default channel, so the email field is the required one.
  await page.locator('#email').fill('jane@example.com');
  await page.locator('#message').fill('Do you deliver to Altona?');
  await page.getByRole('checkbox').check(); // privacy consent

  await page.getByRole('button', { name: 'Send message' }).click();

  // The form swaps to the success confirmation only after the POST resolves —
  // and the api awaits the SMTP send before responding, so by now the message
  // has reached Mailpit.
  await expect(page.getByText('Thanks — we have your message')).toBeVisible();

  // Poll the sink: delivery is fast but the search index may lag the send by a
  // beat. The subject is "Inquiry: <name>", so our token narrows it to one.
  let caught: CaughtMessage[] = [];
  await expect
    .poll(async () => {
      const res = await request.get(`${MAILPIT_API}/search`, {
        params: { query: name },
      });
      caught = ((await res.json()) as { messages: CaughtMessage[] }).messages;
      return caught.length;
    })
    .toBe(1);

  expect(caught[0].Subject).toContain(name);
  expect(caught[0].To.map((t) => t.Address)).toContain(contactTo);
});
