import { readFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';
import { cached, JourneyAdapter, Probe } from '../support/journey/journey';
import { CUSTOMER_SYNC_PROBES as reading } from './customer-sync-probe-labels';

/**
 * What a customer-exchange journey acts on and reads — the customer half of
 * the journey facility (`support/journey/journey.ts`), which knows no more
 * about accounts arriving from outside than it does about orders.
 *
 * The question here is the one no single-submission test answers: **what an
 * account and the two inboxes around it do across a sequence of runs.** An
 * account the exchange asks for cannot be signed into until its owner has
 * followed a link this platform sent; a run that takes access away waits for a
 * person and the account is untouched until they say so; a withdrawal and a
 * reinstatement are two runs apart. Each of those is a claim about a run in
 * the light of the run before it, and a per-endpoint test only ever sees one.
 */

export interface CustomerSyncJourneyContext {
  /** This journey's own source key and address, so two journeys never write
   * each other's account. */
  readonly sourceId: string;
  readonly email: string;
  /** What the person will set for themselves once they have a link. Never
   * what the exchange sends: it sends none (FR-ADM-13). */
  readonly password: string;
  /** A price list that exists in this deployment, read from the database
   * rather than named here: tier keys are a shop's own commercial vocabulary
   * and no fixture may invent one. */
  readonly tierKey: string;
  readonly token: string;
  readonly adminCookie: string;
  /** The panel's staged customer-run count when the journey started; every
   * reading is against this, so a deployment's own history is not in the
   * figures. */
  readonly stagedAtStart: number;
  /** The newest run this journey produced — what a manager's apply or discard
   * acts on. */
  runId?: string;
  /** The set-a-password link the account was last sent, kept for the step
   * where its owner uses it. */
  link?: string;
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

const asMachine = (
  ctx: CustomerSyncJourneyContext,
  url: string,
  body: unknown,
) => ok(call('post', url, body, { Authorization: `Bearer ${ctx.token}` }));

const asStaff = (
  ctx: CustomerSyncJourneyContext,
  method: 'get' | 'post',
  url: string,
) =>
  ok(
    call(method, url, method === 'post' ? {} : undefined, {
      Cookie: ctx.adminCookie,
    }),
  );

/**
 * The deployment's own wording, used to recognise mail rather than to assert
 * on it: a reworded template must not fail these specs. What they are about is
 * *which* message arrived — and, more often, that none did.
 */
const mailText = JSON.parse(readFileSync(requireEnv('MAIL_TEXT_FILE'), 'utf8'));

/** The shop's three, in the customer exchange's own words (FR-NOTIF-09). */
const SHOP_MAIL_KINDS: Readonly<Record<string, string>> = {
  failed: 'customerSyncFailed',
  recovered: 'customerSyncRecovered',
  waiting: 'customerSyncWaiting',
};

/** And the one thing the exchange can send the person themselves. */
const CUSTOMER_MAIL_KINDS: Readonly<Record<string, string>> = {
  accountCreated: 'invitationCreated',
  accountApproved: 'invitationApproved',
};

/** How a run's status reads in the documentation, exactly as the catalog's
 * does: a status nobody outside the schema uses is not a reading. */
const RUN_WORDS: Readonly<Record<string, string>> = {
  previewed: 'waiting',
  'no-change': 'no change',
};

/** The set-a-password token in a message, wherever one is carried. */
const tokenIn = (text: string): string | undefined =>
  /\/set-password\?token=([\w-]+)/.exec(text)?.[1];

/**
 * The newest link sitting in the account's inbox, for the steps the mail probe
 * never saw.
 *
 * A journey's precondition runs without probes — it is setup, and asserting it
 * would be asserting somebody else's journey — so a `from` that has the
 * exchange create an account and then opens its link has nothing stashed. The
 * inbox is left as it is: `begin` drains it when it takes the first reading,
 * which is exactly where setup mail is supposed to go.
 */
async function latestLink(email: string): Promise<string | undefined> {
  const messages = await messagesMatching(`to:${email}`);
  for (const message of messages) {
    const token = tokenIn((await messageBody(message.ID)).Text);
    if (token) return token;
  }
  return undefined;
}

const currentRun = (
  ctx: CustomerSyncJourneyContext,
  cache: Map<string, unknown>,
) =>
  cached(cache, 'run', async () => {
    if (!ctx.runId) return null;
    const res = await asStaff(ctx, 'get', `/admin/sync/runs/${ctx.runId}`);
    return res.data.run as { id: string; status: string };
  });

/**
 * The account, read as staff read it — by address, through the panel's own
 * list, rather than out of the database: what these journeys are about is what
 * the shop sees.
 */
const account = (
  ctx: CustomerSyncJourneyContext,
  cache: Map<string, unknown>,
) =>
  cached(cache, 'account', async () => {
    const res = await asStaff(
      ctx,
      'get',
      `/admin/users?q=${encodeURIComponent(ctx.email)}`,
    );
    return (
      (res.data.users as { email: string; status: string }[]).find(
        (item) => item.email === ctx.email,
      ) ?? null
    );
  });

const probes: Record<string, Probe<CustomerSyncJourneyContext>> = {
  run: {
    label: reading.run.label,
    read: async (ctx, cache) => {
      const run = await currentRun(ctx, cache);
      if (!run) return 'none';
      return RUN_WORDS[run.status] ?? run.status;
    },
  },
  account: {
    label: reading.account.label,
    // `none` rather than `gone`: before the first run there is nothing, and
    // the exchange has no way to take an account back out of existence.
    read: async (ctx, cache) => (await account(ctx, cache))?.status ?? 'none',
  },
  /**
   * The reading the whole first half of these journeys exists for. A status
   * says an account was asked for; only a sign-in says whether anybody can
   * use it, which is the difference FR-ADM-13 is about.
   */
  signsIn: {
    label: reading.signsIn.label,
    read: async (ctx) => {
      const res = await call('post', '/auth/login', {
        email: ctx.email,
        password: ctx.password,
      });
      return res.status === 200 ? 'yes' : 'no';
    },
  },
  waiting: {
    label: reading.waiting.label,
    // The panel's own figure, asked of the endpoint the panel asks
    // (FR-WORK-02): a count that disagreed with the marker staff see would be
    // the one thing this is meant to catch.
    read: async (ctx) => {
      const res = await asStaff(ctx, 'get', '/work/counts');
      return (res.data.stagedCustomerRuns ?? 0) - ctx.stagedAtStart;
    },
  },
  shopMail: {
    label: reading.shopMail.label,
    kind: 'event',
    quiet: [],
    read: async (ctx) => {
      const query = `to:${requireEnv('MAIL_ADMIN_TO')}`;
      const messages = await messagesMatching(query);
      const kinds: string[] = [];
      for (const message of messages) {
        const body = await messageBody(message.ID);
        const match = Object.entries(SHOP_MAIL_KINDS).find(([key]) =>
          body.Text.includes(mailText.syncRun.areas.customers[key].heading),
        );
        kinds.push(match ? match[1] : `unrecognised: ${message.Subject}`);
      }
      await deleteMatching(query);
      return kinds.sort();
    },
  },
  customerMail: {
    label: reading.customerMail.label,
    kind: 'event',
    quiet: [],
    read: async (ctx) => {
      const query = `to:${ctx.email}`;
      const messages = await messagesMatching(query);
      const kinds: string[] = [];
      for (const message of messages) {
        const body = await messageBody(message.ID);
        const match = Object.entries(CUSTOMER_MAIL_KINDS).find(([key]) => {
          const heading = mailText[key]?.heading;
          return heading && body.Text.includes(heading);
        });
        kinds.push(match ? match[1] : `unrecognised: ${message.Subject}`);
        // Whatever link this message carried, kept for the step that uses it.
        ctx.link = tokenIn(body.Text) ?? ctx.link;
      }
      await deleteMatching(query);
      return kinds.sort();
    },
  },
};

/** One row the source might send about this journey's account. */
const row = (
  ctx: CustomerSyncJourneyContext,
  over: Record<string, unknown> = {},
) => ({
  sourceId: ctx.sourceId,
  email: ctx.email,
  access: 'enabled',
  ...over,
});

const actions: JourneyAdapter<CustomerSyncJourneyContext>['actions'] = {
  /**
   * The source sends what it holds about a customer (FR-ADM-11). `access`
   * switches the account on or off, `tier` moves it onto the deployment's own
   * price list, and `claimByEmail` asks for an account somebody registered
   * here to be adopted by address (FR-ADM-17).
   */
  submit: {
    label: 'sends the customer',
    run: async (ctx, args) => {
      const res = await asMachine(ctx, '/machine/sync/customers/runs', {
        rows: [
          row(ctx, {
            ...(args['access'] ? { access: args['access'] } : {}),
            ...(args['tier'] ? { tierKey: ctx.tierKey } : {}),
          }),
        ],
        label: 'journey-customers',
        requestReview: args['requestReview'] ?? false,
        // A claim is a property of the *run* — what this submission is allowed
        // to do — rather than of the row, which is why it travels in the
        // options beside the field list (FR-ADM-17).
        ...(args['claimByEmail'] ? { options: { claimByEmail: true } } : {}),
      });
      ctx.runId = res.data.run.id;
    },
  },
  /** The source reporting its own breakage: a run that never got as far as
   * intent, recorded so an exchange that has stopped does not look like one
   * with nothing to send. */
  reportFailure: {
    label: 'reports that it broke',
    run: async (ctx, args) => {
      const res = await asMachine(ctx, '/machine/sync/customers/failures', {
        message: (args['message'] as string) ?? 'customer export ended early',
        label: 'journey-customers',
      });
      ctx.runId = res.data.run.id;
    },
  },
  apply: {
    label: 'applies the staged run',
    run: async (ctx) => {
      await asStaff(ctx, 'post', `/admin/sync/runs/${ctx.runId}/commit`);
    },
  },
  discard: {
    label: 'discards the staged run',
    run: async (ctx) => {
      await asStaff(ctx, 'post', `/admin/sync/runs/${ctx.runId}/discard`);
    },
  },
  /** The person doing the one thing only they can: setting a password of
   * their own, from the link this platform sent them. */
  setPassword: {
    label: 'sets a password from the link',
    run: async (ctx) => {
      const token = ctx.link ?? (await latestLink(ctx.email));
      if (!token) throw new Error('no set-password link was received');
      await ok(
        call('post', '/auth/set-password', {
          token,
          password: ctx.password,
        }),
      );
    },
  },
  /** Somebody registering here, which is how an account without a source key
   * comes to exist at all. */
  register: {
    label: 'registers on the website',
    run: async (ctx) => {
      await ok(
        call('post', '/auth/register', {
          email: ctx.email,
          firstName: 'Ada',
          lastName: 'Lovelace',
          phone: '+49 40 7654321',
          customerType: 'person',
        }),
      );
    },
  },
};

export const customerSyncJourneyAdapter: JourneyAdapter<CustomerSyncJourneyContext> =
  {
    actions,
    probes,
  };
