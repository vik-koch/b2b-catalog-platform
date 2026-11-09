import { readFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';

import { consentVersion } from '../support/consent';
import { configFile } from '../support/env';
import { cached, JourneyAdapter, Probe } from '../support/journey/journey';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';
import { ACCOUNT_PROBES as reading } from './account-probe-labels';

/**
 * What an account journey acts on and reads, for the journey facility
 * (`support/journey/journey.ts`): what a holder is told across staff
 * decisions, and whether their password still opens the account. A
 * deactivation that retires a credential shows only a month later.
 */

export interface AccountJourneyContext {
  /** The account this journey walks, and the address its mail is read at. */
  readonly email: string;
  /** The one password every journey uses, so "can sign in" is a fair question
   * at every step. */
  readonly password: string;
  readonly adminCookie: string;
  /** Resolved from the email on first use and kept: an account keeps its id
   * through every status it has. */
  id?: string;
  /** The newest password link, captured by the mail probe: the inbox drains
   * each step, and a link from the mail that arrived proves the shop sent
   * it. */
  link?: string;
}

const call = async (
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  body?: unknown,
  cookie?: string,
): Promise<AxiosResponse> =>
  axios.request({
    method,
    url,
    data: body,
    headers: cookie ? { Cookie: cookie } : {},
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

/** The account as staff see it: by the list's search, as a manager finds it,
 * then by id, as closing rewrites the email (FR-AUTH-06). `null` without a
 * row: what declining leaves. */
const account = (ctx: AccountJourneyContext, cache: Map<string, unknown>) =>
  cached(cache, 'account', async () => {
    if (ctx.id) {
      const res = await call(
        'get',
        `/admin/users/${ctx.id}`,
        undefined,
        ctx.adminCookie,
      );
      return res.status === 200 ? res.data : null;
    }
    const res = await ok(
      call(
        'get',
        `/admin/users?q=${encodeURIComponent(ctx.email)}`,
        undefined,
        ctx.adminCookie,
      ),
    );
    const found = res.data.users.find(
      (item: { email: string }) => item.email === ctx.email,
    );
    if (found) ctx.id = found.id;
    return found ?? null;
  });

/** The id, for the actions, which act on an account. */
async function idOf(ctx: AccountJourneyContext): Promise<string> {
  if (ctx.id) return ctx.id;
  await account(ctx, new Map());
  if (!ctx.id) throw new Error(`no account for ${ctx.email}`);
  return ctx.id;
}

/** The deployment's wording, to recognise mail, not assert on it: these
 * specs ask which message arrived, or that none did. */
const mailText = (
  JSON.parse(readFileSync(configFile('texts/mail.json'), 'utf8')) as {
    accounts: Record<string, { heading?: string }>;
  }
).accounts;

/** Which message is which, by heading, in the names the journeys use. */
const MAIL_KINDS: Readonly<Record<string, string>> = {
  registrationReceived: 'registrationReceived',
  accountApproved: 'invitationApproved',
  accountCreated: 'invitationCreated',
  passwordReset: 'passwordReset',
  accountDeleted: 'accountDeleted',
};

const marker = (waiting: boolean) => (waiting ? '🟡' : '—');

/** The set-a-password token in a message, wherever one is carried. */
const tokenIn = (text: string): string | undefined =>
  /\/set-password\?token=([\w-]+)/.exec(text)?.[1];

/** The newest link in the inbox, for steps the probe never saw: setup runs
 * without probes, so nothing is stashed. `begin` drains the inbox at its
 * first reading. */
async function linkInInbox(
  ctx: AccountJourneyContext,
): Promise<string | undefined> {
  const messages = await messagesMatching(`to:${ctx.email}`);
  for (const message of messages) {
    const token = tokenIn((await messageBody(message.ID)).Text);
    if (token) return token;
  }
  return undefined;
}

const probes: Record<string, Probe<AccountJourneyContext>> = {
  status: {
    label: reading.status.label,
    // `gone` rather than null: a declined registration is deleted outright
    // (FR-AUTH-03), and "there is no such account" is a state worth reading.
    read: async (ctx, cache) => (await account(ctx, cache))?.status ?? 'gone',
  },
  role: {
    label: reading.role.label,
    read: async (ctx, cache) => (await account(ctx, cache))?.role ?? null,
  },
  tier: {
    label: reading.tier.label,
    read: async (ctx, cache) => {
      const row = await account(ctx, cache);
      if (!row) return null;
      if (!row.tierId) return 'base';
      const tiers = await cached(cache, 'tiers', async () => {
        const res = await ok(
          call('get', '/admin/tiers', undefined, ctx.adminCookie),
        );
        return res.data.tiers as { id: string; key: string }[];
      });
      return tiers.find((tier) => tier.id === row.tierId)?.key ?? 'unknown';
    },
  },
  /** Whether the password opens the account, asked, not inferred: only a
   * sign-in shows a reactivated owner gets in. */
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
  waitingOnShop: {
    label: reading.waitingOnShop.label,
    // Read as the queue rather than as the status, exactly as the order
    // journeys do: the panel's count is a `COUNT` over the filter its link
    // opens, so asking that filter about this one account answers the same
    // question the marker does.
    read: async (ctx) => {
      const res = await ok(
        call(
          'get',
          `/admin/users?status=pending&q=${encodeURIComponent(ctx.email)}`,
          undefined,
          ctx.adminCookie,
        ),
      );
      return marker(
        res.data.users.some(
          (item: { email: string }) => item.email === ctx.email,
        ),
      );
    },
  },
  mail: {
    label: reading.mail.label,
    kind: 'event',
    quiet: [],
    read: async (ctx) => {
      const query = `to:${ctx.email}`;
      const messages = await messagesMatching(query);
      const kinds: string[] = [];
      for (const message of messages) {
        const body = await messageBody(message.ID);
        const match = Object.entries(MAIL_KINDS).find(([key]) => {
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

const actions: JourneyAdapter<AccountJourneyContext>['actions'] = {
  register: {
    label: 'registers',
    run: async (ctx, args) => {
      await ok(
        call('post', '/auth/register', {
          consentVersion: await consentVersion('account'),
          email: ctx.email,
          firstName: 'Ada',
          lastName: 'Lovelace',
          phone: '+494076543210',
          customerType: args['customerType'] ?? 'person',
        }),
      );
    },
  },
  /** Staff creating an unrequested account: a colleague, or a customer known
   * off the platform. */
  createByStaff: {
    label: 'creates the account',
    run: async (ctx, args) => {
      await ok(
        call(
          'post',
          '/admin/users',
          {
            email: ctx.email,
            role: args['role'] ?? 'user',
            firstName: 'Ada',
            lastName: 'Lovelace',
            phone: '+494076543210',
            customerType: 'person',
            tierId: null,
          },
          ctx.adminCookie,
        ),
      );
    },
  },
  /** Approving a registration (FR-AUTH-03): the price list is explicit, named
   * or `null` for the base list. */
  approve: {
    label: 'approves the registration',
    run: async (ctx, args) => {
      const tierKey = args['tier'] as string | undefined;
      let tierId: string | null = null;
      if (tierKey) {
        const res = await ok(
          call('get', '/admin/tiers', undefined, ctx.adminCookie),
        );
        tierId =
          res.data.tiers.find((tier: { key: string }) => tier.key === tierKey)
            ?.id ?? null;
        if (!tierId) throw new Error(`no tier "${tierKey}"`);
      }
      await ok(
        call(
          'post',
          `/admin/users/${await idOf(ctx)}/approve`,
          { tierId },
          ctx.adminCookie,
        ),
      );
    },
  },
  /** Declining one, which deletes it: nothing was ever an account. */
  decline: {
    label: 'declines the registration',
    run: async (ctx) => {
      await ok(
        call(
          'delete',
          `/admin/users/${await idOf(ctx)}`,
          undefined,
          ctx.adminCookie,
        ),
      );
    },
  },
  deactivate: {
    label: 'switches the account off',
    run: async (ctx) => {
      await ok(
        call(
          'patch',
          `/admin/users/${await idOf(ctx)}/active`,
          { active: false },
          ctx.adminCookie,
        ),
      );
    },
  },
  reactivate: {
    label: 'switches the account back on',
    run: async (ctx) => {
      await ok(
        call(
          'patch',
          `/admin/users/${await idOf(ctx)}/active`,
          { active: true },
          ctx.adminCookie,
        ),
      );
    },
  },
  /** The one mail staff can send on somebody's behalf: the invitation while
   * the account has no password, the reset link once it has. */
  sendPasswordLink: {
    label: 'sends a password link',
    run: async (ctx) => {
      await ok(
        call(
          'post',
          `/admin/users/${await idOf(ctx)}/password-link`,
          {},
          ctx.adminCookie,
        ),
      );
    },
  },
  /** The same link, asked for by the account holder from the login form. */
  forgotPassword: {
    label: 'asks for a password link',
    run: async (ctx) => {
      await ok(call('post', '/auth/forgot-password', { email: ctx.email }));
    },
  },
  /**
   * Redeeming whichever link last arrived. The password chosen is the
   * journey's own, so `signsIn` keeps asking the same question throughout.
   */
  choosePassword: {
    label: 'chooses a password',
    run: async (ctx) => {
      const token = ctx.link ?? (await linkInInbox(ctx));
      if (!token) throw new Error('no link has arrived to redeem');
      await ok(
        call('post', '/auth/set-password', {
          token,
          password: ctx.password,
          // Ignored where the account owes no consent.
          consentVersion: await consentVersion('account'),
        }),
      );
      ctx.link = undefined;
    },
  },
  /** The account holder closing their own account (FR-AUTH-06): anonymized,
   * never deleted, because their past orders still have to refer to something. */
  closeAccount: {
    label: 'closes their account',
    run: async (ctx) => {
      const login = await ok(
        call('post', '/auth/login', {
          email: ctx.email,
          password: ctx.password,
        }),
      );
      const cookie = (login.headers['set-cookie'] as string[] | undefined)
        ?.find((entry) => entry.startsWith('session='))
        ?.split(';')[0];
      await ok(
        call(
          'post',
          '/account/delete',
          { password: ctx.password },
          cookie ?? '',
        ),
      );
    },
  },
};

export const accountJourneyAdapter: JourneyAdapter<AccountJourneyContext> = {
  actions,
  probes,
};
