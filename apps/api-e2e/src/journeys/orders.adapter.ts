import { readFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';
import {
  notifyByDefault,
  OrderStatus,
} from '@b2b-catalog-platform/shared/core/ordering';
import { configFile } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';
import { cached, JourneyAdapter, Probe } from '../support/journey/journey';
import { ORDER_PROBES as reading } from './order-probe-labels';

/**
 * What an order journey acts on and reads, for the journey facility
 * (`support/journey/journey.ts`). Actions are a real screen's, on the real
 * endpoints; probes ask what only accumulated state answers: where the order
 * stands, each side's version, what the customer was told and received.
 */

export interface OrderJourneyContext {
  readonly reference: string;
  readonly publicToken: string;
  /** The order's address, unique per journey, isolating mail in the shared
   * Mailpit. */
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

/** The order as the customer's page shows it, their version, not the newest;
 * a guest's token reads the same. */
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

/** The deployment's wording, to recognise mail by heading, not assert on it:
 * a reworded template must not fail these specs. */
const mailText = (
  JSON.parse(readFileSync(configFile('texts/mail.json'), 'utf8')) as {
    ordering: {
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
  }
).ordering;

/** A message in the journeys' terms (`approved`, `readyDelivery`, `receipt`).
 * Status mails share a subject, so the heading identifies them, which also
 * catches a mail about the wrong step. */
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

/** A marker as the panels draw it, a dot or nothing (FR-WORK-02); no panel
 * shows a figure, so none is read. */
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
  /** Whether the shop's panel counts this order (FR-WORK-01), read as the
   * queue: the count is over its link's filter, so asking that for one
   * reference answers the marker's question. */
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
  /** A manager answering the order. `notify` defaults to what the screen's
   * tick box offers, by the shared rule, so "the second `ready` is quiet" is
   * the system's doing, not the test's. */
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
      const to = args['to'] as OrderStatus;
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
  /** A manager changing the order (FR-ORD-03): the order as it stands with one
   * change, as the screen holds it, so a journey names only the change and
   * reverts nothing checkout set. */
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
  /** A file the shop files (FR-ORD-05), the payment instructions in practice:
   * no real slip, but one the sniff accepts. The journeys ask when it opens,
   * not what it says. */
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
