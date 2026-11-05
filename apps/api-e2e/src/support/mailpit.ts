import axios from 'axios';
import { requireEnv } from './env';

// Mailpit's REST API (compose.api-e2e.yml): this suite's own email sink.
const mailpit = axios.create({
  baseURL: `http://localhost:${requireEnv('MAILPIT_UI_PORT')}/api/v1`,
});

export interface CaughtMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

/**
 * One inbox, many parallel suites, so every query here is scoped (`to:`,
 * `subject:`) to the caller's mail; never add an unscoped `/messages` read or
 * delete. Mailpit's queries are a flat AND, no `OR` or parentheses: a
 * parenthesised one matches nothing, so "no mail sent" always passes.
 */
export async function messagesMatching(
  query: string,
): Promise<CaughtMessage[]> {
  const res = await mailpit.get('/search', { params: { query } });
  return res.data.messages as CaughtMessage[];
}

/** The delivered body, both parts and any attachment (FR-ORD-05), as the
 * recipient's client gets them. */
export async function messageBody(id: string): Promise<{
  HTML: string;
  Text: string;
  Attachments: readonly { readonly FileName: string }[];
}> {
  const res = await mailpit.get(`/message/${id}`);
  return res.data;
}

/** Clears only what the query matches, leaving other suites' mail alone. */
export async function deleteMatching(query: string): Promise<void> {
  await mailpit.delete('/search', { params: { query } });
}
