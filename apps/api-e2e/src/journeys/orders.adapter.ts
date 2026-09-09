import { readFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';
import { notifyByDefault } from '@b2b-catalog-platform/shared';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';
import { cached, JourneyAdapter, Probe } from '../support/journey/journey';
import { ORDER_PROBE_LABELS as label } from './order-probe-labels';

/**
 * What an order journey acts on and reads — the orders half of the journey
 * facility (`support/journey/journey.ts`), which knows nothing about orders.
 *
 * The actions are the operations a real screen performs, through the real
 * endpoints. The probes are the questions the accumulated state answers and no
 * single-move test can: where the order stands, which version each side is on,
 * what the customer has already been told, and what arrived in their inbox.
 */

export interface OrderJourneyContext {
  readonly reference: string;
  readonly publicToken: string;
  /** The address on the order, unique per journey, which is what makes the
   * mail readings isolated — Mailpit is shared by every suite at once. */
  readonly contactEmail: string;
  readonly managerCookie: string;
  /** Absent for a guest's order, which is read through its token instead. */
  readonly customerCookie?: string;
}

const call = async (
  method: 'get' | 'post',
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

/**
 * Every action asserts its own success: a journey that carried on past a
 * refused move would report the failure several steps later, against a state
 * nobody can explain.
 */
async function ok(res: Promise<AxiosResponse>): Promise<AxiosResponse> {
  const done = await res;
  if (done.status >= 400) {
    const where = `${done.config.method?.toUpperCase()} ${done.config.url}`;
    throw new Error(`${where} → ${done.status} ${JSON.stringify(done.data)}`);
  }
  return done;
}

const adminOrder = (ctx: OrderJourneyContext, cache: Map<string, unknown>) =>
  cached(cache, 'admin', async () => {
    const res = await ok(
      call(
        'get',
        `/admin/orders/${ctx.reference}`,
        undefined,
        ctx.managerCookie,
      ),
    );
    return res.data;
  });

/** The order as the customer's own page shows it — their version of it, not
 * the newest one. A guest reads the same thing through their token. */
const customerOrder = (ctx: OrderJourneyContext, cache: Map<string, unknown>) =>
  cached(cache, 'mine', async () => {
    const res = await ok(
      ctx.customerCookie
        ? call(
            'get',
            `/account/orders/${ctx.reference}`,
            undefined,
            ctx.customerCookie,
          )
        : call('get', `/orders/by-token/${ctx.publicToken}`),
    );
    return res.data;
  });

/**
 * The deployment's own wording, used to recognise mail rather than to assert on
 * it. A reworded template must not fail these specs — what they are about is
 * *which* message arrived, and the heading is how a message is identified once
 * the words in it are not the point.
 */
const mailText = JSON.parse(
  readFileSync(requireEnv('MAIL_TEXT_FILE'), 'utf8'),
) as {
  orderReceived: { subject: string };
  orderStatusChanged: {
    subject: string;
    statuses: Record<string, { heading: string }>;
  };
  orderDocument: {
    subject: string;
    kinds: Record<string, { heading: string }>;
  };
};

/**
 * What a message is, in the terms the journeys are written in — `approved`,
 * `readyDelivery`, `receipt` — rather than in the words it happens to use.
 *
 * A status mail is identified by its heading, because the subject is the same
 * for all of them: the reference tells the reader which order, the heading
 * tells them what happened to it. That is also the assertion worth having — a
 * mail about the wrong step is exactly what a subject check would miss.
 */
async function classify(id: string, subject: string): Promise<string> {
  if (subject.startsWith(mailText.orderReceived.subject)) return 'receipt';
  const body = (await messageBody(id)).Text;
  const headings = subject.startsWith(mailText.orderDocument.subject)
    ? Object.entries(mailText.orderDocument.kinds)
    : Object.entries(mailText.orderStatusChanged.statuses);
  const match = headings.find(([, wording]) => body.includes(wording.heading));
  return match ? match[0] : `unrecognised: ${subject}`;
}

const probes: Record<string, Probe<OrderJourneyContext>> = {
  status: {
    label: label.status,
    read: async (ctx, cache) => (await adminOrder(ctx, cache)).status,
  },
  payment: {
    label: label.payment,
    read: async (ctx, cache) => (await adminOrder(ctx, cache)).paymentState,
  },
  version: {
    label: label.version,
    read: async (ctx, cache) => (await adminOrder(ctx, cache)).revisionNumber,
  },
  customerSees: {
    label: label.customerSees,
    read: async (ctx, cache) =>
      (await adminOrder(ctx, cache)).customerRevisionNumber,
  },
  toldAbout: {
    label: label.toldAbout,
    read: async (ctx, cache) =>
      [...(await adminOrder(ctx, cache)).notifiedStatuses].sort(),
  },
  customerTotal: {
    label: label.customerTotal,
    read: async (ctx, cache) => (await customerOrder(ctx, cache)).totalMinor,
  },
  customerDocuments: {
    label: label.customerDocuments,
    read: async (ctx, cache) =>
      (await customerOrder(ctx, cache)).documents
        .map((document: { kind: string }) => document.kind)
        .sort(),
  },
  /**
   * What landed in the customer's inbox since the last step, and nothing else:
   * the reading is drained after every step, so a message nobody declared fails
   * the step that sent it rather than the one after.
   */
  mail: {
    label: label.mail,
    kind: 'event',
    quiet: [],
    read: async (ctx) => {
      const query = `to:${ctx.contactEmail}`;
      const messages = await messagesMatching(query);
      const kinds = await Promise.all(
        messages.map((message) => classify(message.ID, message.Subject)),
      );
      await deleteMatching(query);
      return kinds.sort();
    },
  },
};

const actions: JourneyAdapter<OrderJourneyContext>['actions'] = {
  /**
   * A manager answering the order.
   *
   * `notify` is deliberately not defaulted to `false`: unless a journey says
   * otherwise, the move sends whatever the admin screen would have offered —
   * computed from the order's own history by the same shared rule the screen
   * draws its tick box from. That is what makes "the second pass through
   * `ready` is quiet" a property of the system rather than of the argument this
   * test happened to pass.
   */
  move: {
    label: 'moves the order',
    run: async (ctx, args) => {
      const before = (
        await ok(
          call(
            'get',
            `/admin/orders/${ctx.reference}`,
            undefined,
            ctx.managerCookie,
          ),
        )
      ).data;
      const to = args['to'] as string;
      const notify =
        'notify' in args
          ? (args['notify'] as boolean)
          : notifyByDefault(before.status, to, before.notifiedStatuses);
      await ok(
        call(
          'post',
          `/admin/orders/${ctx.reference}/status`,
          {
            to,
            reason: args['reason'] ?? null,
            notify,
            markPaid: args['markPaid'] ?? false,
            showCustomer: args['showCustomer'] ?? true,
          },
          ctx.managerCookie,
        ),
      );
    },
  },
  recordPayment: {
    label: 'records the payment',
    run: async (ctx, args) => {
      await ok(
        call(
          'post',
          `/admin/orders/${ctx.reference}/payment`,
          { paid: args['paid'] ?? true },
          ctx.managerCookie,
        ),
      );
    },
  },
  cancelAsCustomer: {
    label: 'calls the order off',
    run: async (ctx, args) => {
      if (!ctx.customerCookie) {
        throw new Error('a guest has no account to cancel from');
      }
      await ok(
        call(
          'post',
          `/account/orders/${ctx.reference}/cancel`,
          { reason: args['reason'] ?? null },
          ctx.customerCookie,
        ),
      );
    },
  },
};

export const orderJourneyAdapter: JourneyAdapter<OrderJourneyContext> = {
  actions,
  probes,
};
