import { readFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';
import { cached, JourneyAdapter, Probe } from '../support/journey/journey';
import { SYNC_PROBES as reading } from './sync-probe-labels';

/**
 * What a catalog-sync journey acts on and reads — the sync half of the journey
 * facility (`support/journey/journey.ts`), which knows no more about feeds
 * than it does about orders or accounts.
 *
 * The question here is the one no single-run test answers: **what the shop is
 * told across a sequence of runs**, which is mostly nothing. A failure is
 * announced once and its repetitions are silent; a queue that already holds
 * something does not announce itself again. Each of those is a claim about a
 * run in the light of the run before it, and a per-endpoint test can only ever
 * see one.
 */

export interface SyncJourneyContext {
  /** Prefix for this journey's product keys, so two journeys never write each
   * other's catalog. */
  readonly sourceId: string;
  readonly categorySourceId: string;
  readonly categoryName: string;
  readonly token: string;
  readonly adminCookie: string;
  /** The panel's staged count when the journey started; every reading is
   * against this, so a deployment's own history is not in the figures. */
  readonly stagedAtStart: number;
  /** The newest run this journey produced — what an admin's apply or discard
   * acts on. */
  runId?: string;
}

const call = async (
  method: 'get' | 'post',
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<AxiosResponse> =>
  axios.request({
    method,
    url,
    data: body,
    headers,
    validateStatus: () => true,
  });

/** Every action asserts its own success, so a refused step fails where it
 * happened rather than three readings later. */
async function ok(res: Promise<AxiosResponse>): Promise<AxiosResponse> {
  const done = await res;
  if (done.status >= 400) {
    const where = `${done.config.method?.toUpperCase()} ${done.config.url}`;
    throw new Error(`${where} → ${done.status} ${JSON.stringify(done.data)}`);
  }
  return done;
}

const asMachine = (ctx: SyncJourneyContext, url: string, body: unknown) =>
  ok(call('post', url, body, { Authorization: `Bearer ${ctx.token}` }));

const asAdmin = (
  ctx: SyncJourneyContext,
  method: 'get' | 'post',
  url: string,
) =>
  ok(
    call(method, url, method === 'post' ? {} : undefined, {
      Cookie: ctx.adminCookie,
    }),
  );

/**
 * One row the source might send. `prices` carries the base list, which is
 * enough for a run to be able to create the product.
 */
const row = (ctx: SyncJourneyContext, n: number, price = 1000) => ({
  sourceId: `${ctx.sourceId}-${n}`,
  name: `Journey product ${n} (${ctx.sourceId})`,
  categorySourceId: ctx.categorySourceId,
  categoryName: ctx.categoryName,
  prices: { default: price },
});

/**
 * The deployment's own wording, used to recognise mail rather than to assert
 * on it: a reworded template must not fail these specs. What they are about is
 * *which* message arrived — and, more often, that none did.
 */
const mailText = JSON.parse(
  readFileSync(requireEnv('MAIL_TEXT_FILE'), 'utf8'),
) as { syncRun: { kinds: Record<string, { heading: string }> } };

/** Which message is which, by heading, in the names the journeys use. */
const MAIL_KINDS: Readonly<Record<string, string>> = {
  failed: 'syncFailed',
  recovered: 'syncRecovered',
  waiting: 'syncWaiting',
  created: 'syncCreated',
};

/** How a run's status reads in the documentation. The panel says "Waiting"
 * rather than "previewed" for the same reason: a status nobody outside the
 * schema uses is not a reading. */
const RUN_WORDS: Readonly<Record<string, string>> = {
  previewed: 'waiting',
  'no-change': 'no change',
};

/**
 * The run this journey last produced, read as an admin reads it.
 *
 * By id rather than "the newest run": the journeys run one after another
 * against a database with its own history, and a reading that could pick up
 * somebody else's run would assert about a feed this journey never touched.
 */
const currentRun = (ctx: SyncJourneyContext, cache: Map<string, unknown>) =>
  cached(cache, 'run', async () => {
    if (!ctx.runId) return null;
    const res = await asAdmin(ctx, 'get', `/admin/sync/runs/${ctx.runId}`);
    return res.data.run as { id: string; status: string };
  });

const probes: Record<string, Probe<SyncJourneyContext>> = {
  run: {
    label: reading.run.label,
    read: async (ctx, cache) => {
      const run = await currentRun(ctx, cache);
      if (!run) return 'none';
      return RUN_WORDS[run.status] ?? run.status;
    },
  },
  /**
   * The panel's own figure, asked of the endpoint the panel asks (FR-WORK-02),
   * rather than counted from the run table here: a count that disagreed with
   * the marker the admin sees would be the one thing this is meant to catch.
   */
  waiting: {
    label: reading.waiting.label,
    read: async (ctx) => {
      const res = await asAdmin(ctx, 'get', '/work/counts');
      return (res.data.stagedSyncRuns ?? 0) - ctx.stagedAtStart;
    },
  },
  mail: {
    label: reading.mail.label,
    kind: 'event',
    quiet: [],
    read: async (ctx) => {
      const query = `to:${requireEnv('MAIL_ADMIN_TO')}`;
      const messages = await messagesMatching(query);
      const kinds: string[] = [];
      for (const message of messages) {
        const body = await messageBody(message.ID);
        const match = Object.entries(MAIL_KINDS).find(([key]) =>
          body.Text.includes(mailText.syncRun.kinds[key].heading),
        );
        kinds.push(match ? match[1] : `unrecognised: ${message.Subject}`);
      }
      await deleteMatching(query);
      return kinds.sort();
    },
  },
};

const actions: JourneyAdapter<SyncJourneyContext>['actions'] = {
  /**
   * The source submits an export (FR-ADM-07). `from`/`count` name the rows it
   * carries and `price` moves them, so a journey can say "the same export
   * again" or "the same products, repriced" without listing products.
   */
  submit: {
    label: 'submits an export',
    run: async (ctx, args) => {
      const from = (args['from'] as number) ?? 1;
      const count = (args['count'] as number) ?? 2;
      const rows = Array.from({ length: count }, (_, index) =>
        row(ctx, from + index, (args['price'] as number) ?? 1000),
      );
      const res = await asMachine(ctx, '/machine/sync/runs', {
        rows,
        label: 'journey-export',
        requestReview: args['requestReview'] ?? false,
      });
      ctx.runId = res.data.run.id;
    },
  },
  /** The source reporting its own breakage (FR-ADM-09): a run that never got
   * as far as intent, recorded so a feed that has stopped does not look like a
   * feed with nothing to send. */
  reportFailure: {
    label: 'reports that it broke',
    run: async (ctx, args) => {
      const res = await asMachine(ctx, '/machine/sync/failures', {
        message: (args['message'] as string) ?? 'export ended early',
        label: 'journey-export',
      });
      ctx.runId = res.data.run.id;
    },
  },
  apply: {
    label: 'applies the staged run',
    run: async (ctx) => {
      await asAdmin(ctx, 'post', `/admin/sync/runs/${ctx.runId}/commit`);
    },
  },
  discard: {
    label: 'discards the staged run',
    run: async (ctx) => {
      await asAdmin(ctx, 'post', `/admin/sync/runs/${ctx.runId}/discard`);
    },
  },
};

export const syncJourneyAdapter: JourneyAdapter<SyncJourneyContext> = {
  actions,
  probes,
};
