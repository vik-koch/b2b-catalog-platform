import axios from 'axios';

// Mailpit's REST API (see compose.db.yml) — the dev/e2e email sink.
const mailpit = axios.create({ baseURL: 'http://localhost:8025/api/v1' });

export interface CaughtMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

/**
 * One inbox, many suites. Jest runs the api-e2e specs in parallel against a
 * single Mailpit, so a suite that lists (or clears) *all* messages sees another
 * suite's mail and fails on the count — the staff inbox in particular receives
 * both an inquiry and a registration notification.
 *
 * So everything here is scoped by a Mailpit search query (`to:`, `subject:`)
 * that only matches the calling suite's own mail. Never add an unscoped
 * `/messages` read or delete back in.
 *
 * Mailpit's query language is a flat AND of terms: **no `OR`, no parentheses**.
 * A parenthesised query does not error — it matches nothing, which turns a
 * "no mail was sent" assertion into one that always passes. Use several
 * single-scope queries instead of one combined one.
 */
export async function messagesMatching(
  query: string,
): Promise<CaughtMessage[]> {
  const res = await mailpit.get('/search', { params: { query } });
  return res.data.messages as CaughtMessage[];
}

/** The delivered body, as the recipient's client would receive both parts. */
export async function messageBody(
  id: string,
): Promise<{ HTML: string; Text: string }> {
  const res = await mailpit.get(`/message/${id}`);
  return res.data as { HTML: string; Text: string };
}

/** Clears only what the query matches, leaving other suites' mail alone. */
export async function deleteMatching(query: string): Promise<void> {
  await mailpit.delete('/search', { params: { query } });
}
