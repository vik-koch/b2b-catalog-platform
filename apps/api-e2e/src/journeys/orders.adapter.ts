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
  const message = await messageBody(id);
  // What travelled with it, said in the name: an attachment is the whole point
  // of some of these messages, and a mail that lost one still reads correctly.
  const carried = message.Attachments.length > 0 ? '+attached' : '';
  if (subject.startsWith(mailText.orderReceived.subject)) {
    return `receipt${carried}`;
  }
  const headings = subject.startsWith(mailText.orderDocument.subject)
    ? Object.entries(mailText.orderDocument.kinds)
    : Object.entries(mailText.orderStatusChanged.statuses);
  const match = headings.find(([, wording]) =>
    message.Text.includes(wording.heading),
  );
  return match ? `${match[0]}${carried}` : `unrecognised: ${subject}`;
}

/**
 * A marker, the way the panels draw one: a dot or nothing (FR-WORK-02). The
 * figure behind it is deliberately not read — neither panel shows a number,
 * and asserting one would be asserting something nobody can see.
 */
const marker = (waiting: boolean) => (waiting ? '🟡' : '—');

/**
 * A reader's documents, named by what is worth saying about them.
 *
 * The two sides read the same order and get different lists, which is the
 * point of having both: a file is filed against a version, and the customer is
 * offered it only once their own view has reached that version.
 */
function documentList(order: {
  documents: readonly {
    kind: string;
    source: string;
    outdated: boolean;
  }[];
}): string[] {
  return order.documents
    .map((document) => {
      const marks = [
        // Only where it is news. The summary is drawn by the platform unless
        // the shop replaces it, so a supplied one is worth saying; payment
        // instructions are only ever supplied, and saying so would be noise.
        ...(document.source === 'supplied' && document.kind === 'order-summary'
          ? ['supplied']
          : []),
        ...(document.outdated ? ['outdated'] : []),
      ];
      return marks.length
        ? `${document.kind} (${marks.join(', ')})`
        : document.kind;
    })
    .sort();
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
    read: async (ctx, cache) => documentList(await customerOrder(ctx, cache)),
  },
  staffDocuments: {
    label: reading.staffDocuments.label,
    read: async (ctx, cache) => documentList(await adminOrder(ctx, cache)),
  },
  /**
   * Whether the shop's own panel is counting this order (FR-WORK-01).
   *
   * Read as the queue rather than as the status: the staff count is a `COUNT`
   * over the very filter its link opens, so asking that filter for this one
   * reference answers the same question the marker does — and keeps answering
   * it if the queue is ever cut differently. The count itself is over every
   * order in the database, which is nothing a journey could assert against.
   */
  waitingOnShop: {
    label: reading.waitingOnShop.label,
    read: async (ctx) => {
      const res = await ok(
        call(
          'get',
          `/admin/orders?status=requested&q=${ctx.reference}`,
          undefined,
          ctx.managerCookie,
        ),
      );
      return marker(
        res.data.items.some(
          (order: { reference: string }) => order.reference === ctx.reference,
        ),
      );
    },
  },
  /**
   * Whether the customer's own panel is flagging it (FR-WORK-01): money owed,
   * or a collection ready to be picked up.
   *
   * Their queue is their own rows, so unlike the shop's it can be read
   * directly. A guest has no panel at all.
   */
  waitingOnCustomer: {
    label: reading.waitingOnCustomer.label,
    read: async (ctx, cache) =>
      ctx.customerCookie
        ? await cached(cache, 'work', async () => {
            const res = await ok(
              call('get', '/work/counts', undefined, ctx.customerCookie),
            );
            return marker(res.data.myPayments + res.data.myPickups > 0);
          })
        : null,
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
   * change: `pieces`, `paymentMethod`, `contactName`. Building it from the
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
                // Counted in pieces, which is not the quantity the line is
                // read in: a line of two packs of ten is twenty.
                pieces:
                  index === 0 && 'pieces' in args
                    ? args['pieces']
                    : line['pieces'],
                unit: line['unit'],
                note: line['note'],
                priceMinor: line['priceMinor'],
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
  /** Taking a supplied file back off. The summary falls back to the one the
   * platform draws; payment instructions stop existing. */
  removeDocument: {
    label: 'takes a supplied document back off',
    run: async (ctx, args) => {
      await ok(
        axios.delete(`/order-documents/${ctx.reference}/${args['kind']}`, {
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
