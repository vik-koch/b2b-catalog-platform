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
import { ORDER_PROBES as reading } from './order-probe-labels';

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
    label: reading.status.label,
    read: async (ctx, cache) => (await adminOrder(ctx, cache)).status,
  },
  payment: {
    label: reading.payment.label,
    read: async (ctx, cache) => (await adminOrder(ctx, cache)).paymentState,
  },
  version: {
    label: reading.version.label,
    read: async (ctx, cache) => (await adminOrder(ctx, cache)).revisionNumber,
  },
  customerSees: {
    label: reading.customerSees.label,
    read: async (ctx, cache) =>
      (await adminOrder(ctx, cache)).customerRevisionNumber,
  },
  toldAbout: {
    label: reading.toldAbout.label,
    read: async (ctx, cache) =>
      [...(await adminOrder(ctx, cache)).notifiedStatuses].sort(),
  },
  reason: {
    label: reading.reason.label,
    read: async (ctx, cache) => (await adminOrder(ctx, cache)).statusReason,
  },
  customerTotal: {
    label: reading.customerTotal.label,
    read: async (ctx, cache) => (await customerOrder(ctx, cache)).totalMinor,
  },
  customerDocuments: {
    label: reading.customerDocuments.label,
    read: async (ctx, cache) =>
      (await customerOrder(ctx, cache)).documents
        .map((document: { kind: string; outdated: boolean }) =>
          document.outdated ? `${document.kind} (outdated)` : document.kind,
        )
        .sort(),
  },
  /**
   * What landed in the customer's inbox since the last step, and nothing else:
   * the reading is drained after every step, so a message nobody declared fails
   * the step that sent it rather than the one after.
   */
  mail: {
    label: reading.mail.label,
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
  /**
   * A manager changing what the order says (FR-ORD-03).
   *
   * The payload is the order as it stands, sent back with one thing different
   * — which is what the admin screen holds — so a journey names only the
   * change: `units`, `paymentMethod`, `contactName`. Building it from the
   * order rather than from a literal is what lets a journey adjust an order it
   * did not place, and keeps a change from silently reverting a field the
   * checkout set.
   */
  adjust: {
    label: 'changes what the order says',
    run: async (ctx, args) => {
      const order = (
        await ok(
          call(
            'get',
            `/admin/orders/${ctx.reference}`,
            undefined,
            ctx.managerCookie,
          ),
        )
      ).data;
      const withLabel = (address: Record<string, unknown> | null) =>
        address ? { ...address, label: null } : null;
      await ok(
        call(
          'post',
          `/admin/orders/${ctx.reference}/adjustment`,
          {
            lines: order.lines.map(
              (line: Record<string, unknown>, index: number) => ({
                slug: line['slug'],
                // Counted in basis units, which is neither the piece count
                // nor the quantity the line is read in: a line of 20 pieces
                // priced per 10 is two of them.
                units:
                  index === 0 && 'units' in args
                    ? args['units']
                    : (line['pieces'] as number) /
                      (line['priceBasisPieces'] as number),
                unit: line['unit'],
                note: line['note'],
                priceMinor: line['priceMinor'],
                priceBasisPieces: line['priceBasisPieces'],
              }),
            ),
            contact:
              'contactName' in args
                ? { ...order.contact, name: args['contactName'] }
                : order.contact,
            party: order.party,
            fulfilmentMethod: order.fulfilmentMethod,
            deliveryAddress: withLabel(order.deliveryAddress),
            pickupLocationKey: order.pickup ? order.pickup.key : null,
            billingAddress: withLabel(order.billingAddress),
            paymentMethod: args['paymentMethod'] ?? order.paymentMethod,
            tierKey: order.tierKey,
            note: args['note'] ?? null,
            notify: args['notify'] ?? false,
            basedOnRevision: order.revisionNumber,
          },
          ctx.managerCookie,
        ),
      );
    },
  },
  /**
   * The button that moves the customer's view on, and writes to them if asked.
   *
   * The manual half of a rule that is otherwise automatic: a change moves
   * nothing on its own, and an ended order's moves stop moving their page, so
   * this is how anything reaches them in either case.
   */
  tellCustomer: {
    label: 'shows the customer where the order got to',
    run: async (ctx, args) => {
      await ok(
        call(
          'post',
          `/admin/orders/${ctx.reference}/notify`,
          { notify: args['notify'] ?? true },
          ctx.managerCookie,
        ),
      );
    },
  },
  /**
   * A file the shop files against the order (FR-ORD-05) — in practice the
   * payment instructions, which only the shop knows the contents of.
   *
   * Not a real slip, but real enough that the content sniff accepts it: what
   * the journeys are about is when the customer may open it, never what it
   * says.
   */
  supplyDocument: {
    label: 'files a document against the order',
    run: async (ctx, args) => {
      const kind = args['kind'] as string;
      const bytes = Buffer.from(
        `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
      );
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
        'payment.pdf',
      );
      form.append('notify', String(args['notify'] ?? false));
      await ok(
        axios.post(`/order-documents/${ctx.reference}/${kind}`, form, {
          headers: { Cookie: ctx.managerCookie },
          validateStatus: () => true,
        }),
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
