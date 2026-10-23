/**
 * The platform's machine API, as the back office sees it: a bearer token and
 * a few routes (docs/catalog-machine-api.md). Nothing here knows the platform's
 * code — this is the client an ERP adapter writes, in its smallest form.
 */

/** What one write came to, sorted the way the simulator acts on it. */
export type Outcome =
  /** The platform took the run: applied, no-change, or staged for a person. */
  | {
      kind: 'run';
      status: string;
      stagedReason: string | null;
      summary: Record<string, unknown>;
      /** The refused rows as the plan lists them, shortened for the log. */
      rowErrors: string;
    }
  /** The area is the shop's own right now — expected, never a failure. */
  | { kind: 'not-owned' }
  /** Anything else: worth a log line and a failure report. */
  | { kind: 'failed'; detail: string };

/** The sync area of each route family, and the refusal its writes give
 * while the shop holds the area itself. */
const AREAS = {
  catalog: { path: 'sync', notOwned: 'catalog-not-externally-owned' },
} as const;
export type Area = keyof typeof AREAS;

export class Platform {
  readonly #base: string;
  readonly #token: string;

  constructor(base: string, token: string) {
    this.#base = base.replace(/\/+$/, '');
    this.#token = token;
  }

  /** The token's name and scopes — the credential check at boot. */
  async identify(): Promise<{ name: string; scopes: string[] }> {
    const response = await this.#send('GET', '/machine/token');
    if (response.status !== 200) {
      throw new Error(`token refused: ${response.status} ${response.text}`);
    }
    return JSON.parse(response.text);
  }

  /** Submits one run to an area's sync route. */
  async submit(area: Area, body: unknown): Promise<Outcome> {
    const { path, notOwned } = AREAS[area];
    let response: { status: number; text: string };
    try {
      response = await this.#send('POST', `/machine/${path}/runs`, body);
    } catch (error) {
      return { kind: 'failed', detail: `unreachable: ${String(error)}` };
    }
    const json = parse(response.text);
    if (response.status === 201 && json?.['run']) {
      const run = json['run'] as Record<string, unknown>;
      return {
        kind: 'run',
        status: String(run['status']),
        stagedReason: (run['stagedReason'] as string | null) ?? null,
        summary: ((json['plan'] as Record<string, unknown>)?.['summary'] ??
          {}) as Record<string, unknown>,
        rowErrors: JSON.stringify(
          (json['plan'] as Record<string, unknown>)?.['rowErrors'] ?? [],
        ).slice(0, 300),
      };
    }
    if (response.status === 409 && json?.['code'] === notOwned) {
      return { kind: 'not-owned' };
    }
    return {
      kind: 'failed',
      detail: `${response.status} ${String(json?.['code'] ?? response.text).slice(0, 200)}`,
    };
  }

  /** Records a cycle that could not happen, so the shop hears its feed broke.
   * Best effort: a platform that cannot take the report cannot be told. */
  async reportFailure(
    area: Area,
    message: string,
    label: string,
  ): Promise<void> {
    try {
      await this.#send('POST', `/machine/${AREAS[area].path}/failures`, {
        message: message.slice(0, 500),
        label,
      });
    } catch {
      // Logged by the caller already.
    }
  }

  async #send(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; text: string }> {
    const response = await fetch(`${this.#base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.#token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, text: await response.text() };
  }
}

function parse(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
