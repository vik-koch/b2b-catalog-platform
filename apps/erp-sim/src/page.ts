import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';

/** What the page shows, read fresh on every request. */
export interface PageView {
  /** When the shop was last reset — night 0 — on the shop's clock. */
  readonly since: string;
  readonly timeZone: string;
  /** The shop's clock now, as the page prints it. */
  readonly shopTime: string;
  readonly night: number;
  /** The working hour now, or null outside working hours. */
  readonly workingHour: string | null;
  readonly workingHours: string;
  /** Whether a cycle is running right now. */
  readonly busy: boolean;
  /** The last lines of the log, newest last. */
  readonly log: readonly string[];
}

export interface SimulatorPage {
  readonly path: string;
  readonly view: () => PageView;
  /** Runs the hourly cycle now; false when one is running already. */
  readonly runNow: () => Promise<boolean>;
}

/**
 * A reviewer's window onto the simulated back office (ADR 0068): what it has
 * done lately, where the shop's clock stands, and a button that runs the
 * hourly cycle now rather than at the top of the next working hour.
 *
 * It answers on the stack's own network only. Traefik puts it on the shop's
 * domain under `path`, behind the reviewer inbox's login (compose.mailpit.yml),
 * so the page itself checks no credential. It does check that a press of the
 * button came from the page: a browser keeps sending basic-auth credentials,
 * so another site could otherwise post the form for a signed-in reviewer.
 */
export function servePage(port: number, sim: SimulatorPage): Server {
  const server = createServer((request, response) => {
    void handle(sim, request, response).catch(() => {
      if (!response.headersSent) send(response, 500, 'text/plain', 'Error');
    });
  });
  return server.listen(port);
}

async function handle(
  sim: SimulatorPage,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const base = sim.path;

  if (url.pathname === base) {
    response.writeHead(308, { location: `${base}/` }).end();
    return;
  }
  if (url.pathname === `${base}/` && request.method === 'GET') {
    const notice = url.searchParams.get('ran');
    send(response, 200, 'text/html; charset=utf-8', render(sim.view(), notice));
    return;
  }
  if (url.pathname === `${base}/run` && request.method === 'POST') {
    if (request.headers['sec-fetch-site'] !== 'same-origin') {
      send(response, 403, 'text/plain', 'Run the cycle from the page itself.');
      return;
    }
    const ran = await sim.runNow();
    response
      .writeHead(303, { location: `${base}/?ran=${ran ? 'yes' : 'busy'}` })
      .end();
    return;
  }
  send(response, 404, 'text/plain', 'Not found');
}

function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: string,
): void {
  response
    .writeHead(status, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    .end(body);
}

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ] ?? ch,
  );

function render(view: PageView, notice: string | null): string {
  const banner =
    notice === 'yes'
      ? '<p class="note">The cycle ran — its lines are at the end of the log.</p>'
      : notice === 'busy'
        ? '<p class="note">A cycle was already running; nothing was started.</p>'
        : '';
  const rows: [string, string][] = [
    ['Shop clock', `${view.shopTime} (${view.timeZone})`],
    ['Since the last reset', `${view.since}, now night ${view.night}`],
    ['Working hours', view.workingHours],
    [
      'Right now',
      view.workingHour
        ? `working hour ${view.workingHour}:00`
        : 'outside working hours: only the nightly stock runs',
    ],
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulated back office</title>
<style>
  :root { color-scheme: light dark; --ink: #1f2937; --muted: #6b7280; --line: #e5e7eb; --bg: #fff; --panel: #f9fafb; --accent: #0f766e; }
  @media (prefers-color-scheme: dark) { :root { --ink: #e5e7eb; --muted: #9ca3af; --line: #374151; --bg: #111827; --panel: #1f2937; --accent: #2dd4bf; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 56rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .lead { color: var(--muted); margin: 0 0 1.5rem; }
  a { color: var(--accent); }
  form { margin: 0 0 .6rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .4rem 1.25rem; margin: 0 0 1.5rem; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  button { font: inherit; padding: .55rem 1.1rem; border: 0; border-radius: .4rem; background: var(--accent); color: var(--bg); cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .note { padding: .6rem .8rem; background: var(--panel); border-left: 3px solid var(--accent); }
  pre { background: var(--panel); border: 1px solid var(--line); border-radius: .4rem; padding: .8rem; overflow-x: auto; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
  @media (max-width: 34rem) { dl { grid-template-columns: 1fr; } dd { margin-bottom: .5rem; } }
</style>
</head>
<body>
<main>
<h1>Simulated back office</h1>
<p class="lead"><a href="/">The shop</a> · <a href="/inbox/">Reviewer inbox</a></p>
<p class="lead">It owns this shop's catalog, customers and orders and drives them through the platform's machine API, the way a source system would: each night it moves the stock, and each working hour it answers the registrations and moves the orders that are waiting.</p>
${banner}
<dl>
${rows.map(([term, value]) => `<dt>${escape(term)}</dt><dd>${escape(value)}</dd>`).join('\n')}
</dl>
<form method="post" action="run">
<button type="submit"${view.busy ? ' disabled' : ''}>Run the hourly cycle now</button>
</form>
<p class="lead">Answers every waiting registration and moves every open order one step on — without waiting for the hour an order normally stands.</p>
<h2>Log</h2>
<pre>${escape(view.log.join('\n')) || 'Nothing yet.'}</pre>
</main>
</body>
</html>`;
}
