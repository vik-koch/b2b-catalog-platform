import { readFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';
import { cached, JourneyAdapter, Probe } from '../support/journey/journey';
import { ORDER_SYNC_PROBES as reading } from './order-sync-probe-labels';

/**
 * What an order-exchange journey acts on and reads — the third adapter on the
 * journey facility (`support/journey/journey.ts`), which knows as little about
 * an order arriving back from outside as it does about accounts.
 *
 * The question it answers is the one neither neighbour does.
 * `machine-order-sync.spec.ts` asks what one instruction is allowed to do;
 * `order-journeys.spec.ts` walks an order that the *shop* answers, through the
 * admin panel. This walks an order nobody here answers at all: the area is
 * handed over for the length of the journey, every staff button is refused,
 * and everything that happens to the order arrives over the wire. What
 * accumulates is the thing worth checking — that four exchanges leave four
 * versions and not twelve, that a polling source re-sending its last word
 * writes nothing and mails nobody, and that the customer's page and inbox
 * still read as though a manager had been there.
 */

export interface OrderSyncJourneyContext {
  readonly reference: string;
  /** The address on the order — unique per journey, which is what scopes the
   * mail readings: Mailpit is shared by every suite at once. */
  readonly contactEmail: string;
  readonly customerCookie: string;
  /** Staff's own reading of the order. A session, not the token: while the
   * area is owned the panel keeps every screen and loses every button. */
  readonly adminCookie: string;
  /** The credential the source system holds — `order-read` and `order-sync`
   * together, which is the ordinary shape of an adapter that has gone live. */
  readonly token: string;
  /** The key the catalog exchange delivered this journey's product under. A
   * write-back names lines by it and never by the storefront slug. */
  readonly productSourceId: string;
  /** The version the source last read, which every instruction has to answer.
   * Kept here rather than in the journeys so a step says what it does rather
   * than counting versions. */
  basedOnRevision: number;
  /** What the last batch, and the instruction in it, answered — for the two
   * probes that read them. An exchange's own report of what it did is not
   * recoverable from the order afterwards: `unchanged` leaves no trace at all,
   * which is the point of it. Both are cleared by every action, so they read
   * as the step's own doing and never as the step before's. */
  run?: string[];
  lastInstruction?: string[];
}

const call = async (
  method: 'get' | 'post' | 'delete',
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
 * happened rather than three readings later. A refused *instruction* is a
 * different thing: the batch carrying it succeeds, and the refusal is a
 * reading. */
async function ok(res: Promise<AxiosResponse>): Promise<AxiosResponse> {
  const done = await res;
  if (done.status >= 400) {
    const where = `${done.config.method?.toUpperCase()} ${done.config.url}`;
    throw new Error(`${where} → ${done.status} ${JSON.stringify(done.data)}`);
  }
  return done;
}

const asMachine = (
  ctx: OrderSyncJourneyContext,
  method: 'get' | 'post',
  url: string,
  body?: unknown,
) => ok(call(method, url, body, { Authorization: `Bearer ${ctx.token}` }));

const asStaff = (ctx: OrderSyncJourneyContext, url: string) =>
  ok(call('get', url, undefined, { Cookie: ctx.adminCookie }));

/**
 * The deployment's own wording, used to recognise mail rather than to assert
 * on it: a reworded template must not fail these specs. What they are about is
 * *which* message arrived — and, more often, that none did.
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
  syncRun: {
    areas: { orders: Record<string, { heading: string }> };
  };
};

/** The shop's two, in the order exchange's own words (FR-NOTIF-09). There is
 * no third: nothing here waits for a decision. */
const SHOP_MAIL_KINDS: Readonly<Record<string, string>> = {
  failed: 'orderSyncFailed',
  recovered: 'orderSyncRecovered',
};

/**
 * What a message to the customer is, in the terms the journeys are written in.
 * Identical in spirit to the order journeys' own classifier: a status mail is
 * named by its heading, because every one of them shares a subject.
 */
async function classify(id: string, subject: string): Promise<string> {
  const message = await messageBody(id);
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

/** How a run's status reads in the documentation, as in every area. */
const RUN_WORDS: Readonly<Record<string, string>> = {
  'no-change': 'no change',
};

const adminOrder = (
  ctx: OrderSyncJourneyContext,
  cache: Map<string, unknown>,
) =>
  cached(cache, 'admin', async () => {
    const res = await asStaff(ctx, `/admin/orders/${ctx.reference}`);
    return res.data;
  });

/** The order as the customer's own page shows it — their version of it, which
 * is not always the newest one. */
const customerOrder = (
  ctx: OrderSyncJourneyContext,
  cache: Map<string, unknown>,
) =>
  cached(cache, 'mine', async () => {
    const res = await ok(
      call('get', `/account/orders/${ctx.reference}`, undefined, {
        Cookie: ctx.customerCookie,
      }),
    );
    return res.data;
  });

/** What the source sees when it looks, through its own credential. */
const machineOrder = (
  ctx: OrderSyncJourneyContext,
  cache: Map<string, unknown>,
) =>
  cached(cache, 'machine', async () => {
    const res = await asMachine(ctx, 'get', `/machine/orders/${ctx.reference}`);
    return res.data as { status: string; revisionNumber: number };
  });

const probes: Record<string, Probe<OrderSyncJourneyContext>> = {
  run: {
    label: reading.run.label,
    kind: 'event',
    quiet: [],
    // An event, not a state: a run is something that happened, and a step that
    // says nothing about one is asserting that the source did not submit.
    read: async (ctx) => ctx.run ?? [],
  },
  instruction: {
    label: reading.instruction.label,
    kind: 'event',
    quiet: [],
    read: async (ctx) => ctx.lastInstruction ?? [],
  },
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
  readsOut: {
    label: reading.readsOut.label,
    read: async (ctx, cache) => {
      const order = await machineOrder(ctx, cache);
      return `${order.status} @ ${order.revisionNumber}`;
    },
  },
  customerDocuments: {
    label: reading.customerDocuments.label,
    read: async (ctx, cache) =>
      ((await customerOrder(ctx, cache)).documents as { kind: string }[])
        .map((document) => document.kind)
        .sort(),
  },
  customerMail: {
    label: reading.customerMail.label,
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
  shopMail: {
    label: reading.shopMail.label,
    kind: 'event',
    quiet: [],
    read: async () => {
      const query = `to:${requireEnv('MAIL_ADMIN_TO')}`;
      const messages = await messagesMatching(query);
      const kinds: string[] = [];
      for (const message of messages) {
        const body = await messageBody(message.ID);
        const match = Object.entries(SHOP_MAIL_KINDS).find(([key]) =>
          body.Text.includes(mailText.syncRun.areas.orders[key].heading),
        );
        kinds.push(match ? match[1] : `unrecognised: ${message.Subject}`);
      }
      await deleteMatching(query);
      return kinds.sort();
    },
  },
};

/**
 * Where the batch's own answer and the instruction's answer are recorded, so
 * the two event probes can read them.
 *
 * Called by **every** action, including the ones that submit nothing: an
 * action that left the last run in place would have the next step assert a
 * submission that never happened.
 */
function record(
  ctx: OrderSyncJourneyContext,
  run?: string,
  instruction?: string,
): void {
  ctx.run = run ? [RUN_WORDS[run] ?? run] : [];
  ctx.lastInstruction = instruction ? [instruction] : [];
}

const actions: JourneyAdapter<OrderSyncJourneyContext>['actions'] = {
  /**
   * The source looking at the order book (FR-ADM-08, first half).
   *
   * Every exchange begins here in production, and the journeys say so where it
   * matters: what a poll learns is the version its next instruction has to
   * answer, and a source that writes without reading is the one that gets
   * `order-changed`.
   */
  read: {
    label: 'reads the order',
    run: async (ctx) => {
      const res = await asMachine(
        ctx,
        'get',
        `/machine/orders/${ctx.reference}`,
      );
      ctx.basedOnRevision = res.data.revisionNumber;
      record(ctx);
    },
  },
  /**
   * One exchange: what the owning system says has become of the order.
   *
   * Everything it can carry travels in one instruction, because that is the
   * rule the area exists to keep — `status` moves it, `pieces` re-prices it,
   * `paid` records the money, and all three together write **one** version.
   * `notify` and `showCustomer` are stated rather than defaulted here as they
   * are on the wire: a journey that left them out would be documenting a
   * default the contract deliberately refuses to have.
   */
  writeBack: {
    label: 'writes back what it did',
    run: async (ctx, args) => {
      const instruction: Record<string, unknown> = {
        reference: ctx.reference,
        basedOnRevision: args['basedOn'] ?? ctx.basedOnRevision,
        notify: args['notify'] ?? false,
        showCustomer: args['showCustomer'] ?? true,
      };
      if (args['status']) instruction['status'] = args['status'];
      if (args['reason']) instruction['statusReason'] = args['reason'];
      if (args['note']) instruction['note'] = args['note'];
      if ('paid' in args) instruction['paid'] = args['paid'];
      if ('pieces' in args) {
        instruction['lines'] = [
          {
            productSourceId: ctx.productSourceId,
            pieces: args['pieces'],
            priceMinor: args['priceMinor'] ?? null,
          },
        ];
      }

      const res = await asMachine(ctx, 'post', '/machine/sync/orders/runs', {
        orders: [instruction],
        label: 'journey-orders',
        ...(args['actor'] ? { actor: args['actor'] } : {}),
      });

      const plan = res.data.plan as {
        orders: { kind: string; revisionNumber: number }[];
        rowErrors: { code: string }[];
      };
      const answered = plan.orders[0];
      const refused = plan.rowErrors[0];
      record(
        ctx,
        res.data.run.status,
        refused ? `refused: ${refused.code}` : answered.kind,
      );
      // What the next instruction must answer. A refused one learns nothing,
      // which is exactly the state a source is in until it reads again.
      if (answered) ctx.basedOnRevision = answered.revisionNumber;
    },
  },
  /** The source reporting its own breakage: a run that never got as far as
   * intent, recorded so an exchange that has stopped does not look like one
   * with nothing to send. */
  reportFailure: {
    label: 'reports that it broke',
    run: async (ctx, args) => {
      const res = await asMachine(
        ctx,
        'post',
        '/machine/sync/orders/failures',
        {
          message: (args['message'] as string) ?? 'order export ended early',
          label: 'journey-orders',
        },
      );
      record(ctx, res.data.run.status);
    },
  },
  /**
   * The shop's own paperwork, posted as bytes (FR-ORD-05).
   *
   * Not a real invoice, but real enough that the content sniff accepts it:
   * what the journeys are about is when the customer may open it, never what
   * it says. It files no run and writes no version, which is what the readings
   * around it assert.
   */
  supplyDocument: {
    label: 'files the shop’s document against the order',
    run: async (ctx, args) => {
      const bytes = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
      );
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
        'invoice.pdf',
      );
      form.append('notify', String(args['notify'] ?? false));
      await ok(
        axios.post(
          `/machine/orders/${ctx.reference}/documents/${args['kind']}`,
          form,
          {
            headers: { Authorization: `Bearer ${ctx.token}` },
            validateStatus: () => true,
          },
        ),
      );
      record(ctx);
    },
  },
  /**
   * The one thing the customer may still do to an order however the area is
   * owned (FR-ADM-10, FR-ORD-02). It is not a conflict for the exchange to
   * resolve — it is a fact the exchange has to read.
   */
  cancelAsCustomer: {
    label: 'calls the order off',
    run: async (ctx, args) => {
      await ok(
        call(
          'post',
          `/account/orders/${ctx.reference}/cancel`,
          { reason: args['reason'] ?? null },
          { Cookie: ctx.customerCookie },
        ),
      );
      record(ctx);
    },
  },
};

export const orderSyncJourneyAdapter: JourneyAdapter<OrderSyncJourneyContext> =
  {
    actions,
    probes,
  };
