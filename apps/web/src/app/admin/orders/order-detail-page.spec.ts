import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminOrderDetail, OrderRevision } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminOrderDetailPage } from './order-detail-page';
import { AdminOrdersService } from './orders.service';

const text = defaultAdminText.orderDetail;

const address = {
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE' as const,
};

const placed: AdminOrderDetail = {
  reference: 'DEMO-260826-4831',
  status: 'requested',
  paymentState: 'not-due',
  statusReason: null,
  changes: [],
  revisionNumber: 1,
  customerRevisionNumber: 1,
  notifiedRevisionNumber: 1,
  notifiedStatuses: ['requested'],
  paidAt: null,
  createdAt: '2026-08-26T09:15:00.000Z',
  statusChangedAt: '2026-08-26T09:15:00.000Z',
  totalMinor: 12990,
  currency: 'EUR',
  itemCount: 1,
  contact: {
    name: 'Alex Fischer',
    email: 'alex@example.com',
    phone: '+494012345678',
  },
  party: { name: 'Kontor GmbH', registrationId: 'DE123456789' },
  fulfilmentMethod: 'delivery',
  deliveryAddress: address,
  pickup: null,
  deliveryZone: null,
  billingAddress: address,
  paymentMethod: 'bank-transfer',
  preferredDate: null,
  customerNote: null,
  customerEmail: 'alex@example.com',
  tierKey: 'wholesale',
  lines: [
    {
      name: 'Espresso cups',
      slug: 'espresso-cups',
      linked: true,
      image: null,
      unit: 'box',
      quantity: 1,
      pieces: 100,
      // A box of a hundred, priced per ten.
      priceMinor: 1999,
      priceBasisPieces: 10,
      lineTotalMinor: 19990,
      note: null,
    },
  ],
  shipment: {
    cartons: 1,
    volume: null,
    weight: null,
    coveredLines: 1,
    uncoveredLines: 0,
    approximate: false,
  },
};

/** Two versions of it: the one on file, and the one it superseded. */
const versions: OrderRevision[] = [
  {
    ...placed,
    revisionNumber: 2,
    totalMinor: 25980,
    changes: ['One more box, as agreed.'],
    note: 'One more box, as agreed.',
    kind: 'adjustment',
    author: 'manager@example.com',
    revisionCreatedAt: '2026-08-27T10:00:00.000Z',
    customerView: false,
    notifiedAt: null,
    lines: [{ ...placed.lines[0], quantity: 2, lineTotalMinor: 39980 }],
  },
  {
    ...placed,
    revisionNumber: 1,
    note: null,
    kind: 'submitted',
    author: null,
    revisionCreatedAt: '2026-08-26T09:15:00.000Z',
    customerView: true,
    notifiedAt: '2026-08-26T09:16:00.000Z',
  },
];

async function render(
  answer: AdminOrderDetail | null | 'reject',
  api: Partial<Record<'transition' | 'setPayment' | 'revisions', unknown>> = {},
) {
  const get = vi.fn(() =>
    answer === 'reject'
      ? Promise.reject(new Error('500'))
      : Promise.resolve(answer),
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminOrderDetailPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      {
        provide: AdminOrdersService,
        useValue: {
          get,
          revisions: vi.fn(async () => versions),
          ...api,
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminOrderDetailPage);
  fixture.componentRef.setInput('reference', placed.reference);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, get };
}

describe('AdminOrderDetailPage (FR-AUTH-03)', () => {
  // FR-UNIT-04: the source system prices in basis units, so staff read the
  // line in them — not in the unit the customer bought through.
  it('reads a line in basis units', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain('10 ×');
    expect(el.textContent).toMatch(/19[.,]99/);
  });

  it('shows what only staff see', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain(text.customer);
    expect(el.textContent).toContain('alex@example.com');
    expect(el.textContent).toContain(text.tier);
    expect(el.textContent).toContain('wholesale');
  });

  // The default list has no key of its own, and a guest has no account: both
  // are facts about the order rather than blanks.
  it('names the default price list and a guest order', async () => {
    const { el } = await render({
      ...placed,
      tierKey: null,
      customerEmail: null,
    });

    expect(el.textContent).toContain(text.tierDefault);
    expect(el.textContent).toContain(defaultAdminText.orderList.guest);
  });

  it('reads the order back in the admin’s own words', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain(text.items);
    expect(el.textContent).toContain(text.invoice);
    expect(el.textContent).toContain('Kontor GmbH · DE123456789');
    expect(el.textContent).toContain(text.billingSame);
    expect(el.textContent).toContain(text.transfer);
    expect(el.textContent).toContain(text.whenAny);
  });

  it('says an unknown reference opens nothing', async () => {
    const { el } = await render(null);

    expect(el.textContent).toContain(text.notFound);
  });

  it('says so when the order cannot be read', async () => {
    const { el } = await render('reject');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.loadError,
    );
  });
});

/**
 * Answering an order (FR-ORD-01/02/04). What is worth pinning is that the page
 * offers exactly the moves the shared table allows from where the order stands
 * — a button drawn for a move the API refuses is the failure this table exists
 * to prevent.
 */
describe('AdminOrderDetailPage answering an order', () => {
  const buttons = (el: HTMLElement) =>
    [...el.querySelectorAll('button')].map((button) =>
      button.textContent?.trim(),
    );

  it('offers a request the two answers it has, and no cancel', async () => {
    const { el } = await render(placed);

    expect(buttons(el)).toContain(text.actions.approve);
    expect(buttons(el)).toContain(text.actions.decline);
    // Refusing an unanswered order is declining it; cancelling is what happens
    // to one the shop had already taken on.
    expect(buttons(el)).not.toContain(text.actions.cancel);
  });

  it('words handing over by how the order arrives', async () => {
    const delivery = await render({ ...placed, status: 'approved' });
    expect(buttons(delivery.el)).toContain(text.actions.ready);

    const pickup = await render({
      ...placed,
      status: 'approved',
      fulfilmentMethod: 'pickup',
      deliveryAddress: null,
      pickup: { key: 'hafen', name: 'Hafen', address: 'Hafenstraße 12' },
    });
    expect(buttons(pickup.el)).toContain(text.actions.readyPickup);
  });

  it('offers an ended order only the undo, and says why it ended', async () => {
    const { el } = await render({
      ...placed,
      status: 'cancelled',
      statusReason: 'Ordered twice',
    });

    // Reopening is the recovery from a wrong click, not a step in the order's
    // life — so it is the only move on offer, and the order is not carried on
    // from where it ended. Named one by one rather than as the whole list of
    // buttons: the customer block always offers something, and this asks which
    // *moves* an ended order has.
    expect(buttons(el)).toContain(text.actions.reopen);
    for (const move of [
      text.actions.approve,
      text.actions.decline,
      text.actions.cancel,
      text.actions.ready,
      text.actions.complete,
    ]) {
      expect(buttons(el)).not.toContain(move);
    }
    expect(el.textContent).toContain('Ordered twice');
  });

  it('records a payment on an order that owes one, and never twice', async () => {
    const owing = await render({ ...placed, paymentState: 'awaiting' });
    expect(buttons(owing.el)).toContain(text.paymentState.record);
    expect(owing.el.textContent).toContain(text.paymentState.awaiting);

    const settled = await render({
      ...placed,
      paymentState: 'paid',
      paidAt: '2026-08-27T09:15:00.000Z',
    });
    expect(buttons(settled.el)).not.toContain(text.paymentState.record);
  });

  /** The undo half: a box ticked on the wrong order is corrected here, and it
   * is the same observation set the other way rather than a second control. */
  it('offers a recorded payment back, and asks the server to clear it', async () => {
    const setPayment = vi.fn(() => Promise.resolve(null));
    const { fixture, el, get } = await render(
      { ...placed, paymentState: 'paid', paidAt: '2026-08-27T09:15:00.000Z' },
      { setPayment },
    );
    const confirm = TestBed.inject(ConfirmService);
    vi.spyOn(confirm, 'ask').mockResolvedValue(true);

    expect(buttons(el)).toContain(text.paymentState.clear);
    const clear = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text.paymentState.clear,
    );
    clear?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setPayment).toHaveBeenCalledWith(placed.reference, false);
    // Refused or not, the page redraws from the server rather than from hope.
    expect(get).toHaveBeenCalledTimes(2);
  });

  /** Nothing is owed on an order that ended without being filled, and nothing
   * arrives for it either. */
  it('offers no payment control on an ended order', async () => {
    const { el } = await render({
      ...placed,
      status: 'cancelled',
      paymentState: 'not-due',
    });

    expect(buttons(el)).not.toContain(text.paymentState.record);
    expect(buttons(el)).not.toContain(text.paymentState.clear);
  });

  it('says so when the move was refused, and shows the order as it now is', async () => {
    // The order was answered by somebody else while this page was open: the
    // service answers null, and the page reloads rather than argues.
    const transition = vi.fn(() => Promise.resolve(null));
    const { fixture, el, get } = await render(placed, { transition });
    const confirm = TestBed.inject(ConfirmService);
    const asked = vi.spyOn(confirm, 'askDetailed').mockResolvedValue({
      reason: '',
      checks: { showCustomer: true, notify: true },
    });

    const approve = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text.actions.approve,
    );
    approve?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The first confirmation of an unanswered order offers to write to the
    // customer with the box already ticked: confirming an order is the news
    // they placed it for.
    expect(asked.mock.calls[0][0].checks).toContainEqual(
      expect.objectContaining({ key: 'notify', checked: true }),
    );
    // And the move reaches their page whether or not the mail does, so that
    // tick is offered ticked and hangs the mail off itself.
    expect(asked.mock.calls[0][0].checks).toContainEqual(
      expect.objectContaining({ key: 'showCustomer', checked: true }),
    );
    expect(asked.mock.calls[0][0].checks?.[1].requires).toBe('showCustomer');
    expect(transition).toHaveBeenCalledWith(
      placed.reference,
      'approved',
      null,
      {
        showCustomer: true,
        notify: true,
        markPaid: false,
      },
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.actions.error,
    );
  });

  /**
   * The two ticks a confirmation carries (FR-NOTIF-03, FR-ORD-04). Both are
   * offered with the answer that is right almost always, and neither happens
   * behind the manager's back: the mail cannot be taken back, and a payment
   * recorded as a side effect is one nobody remembers making.
   */
  it('offers the handover of a cash order as its payment, ticked', async () => {
    const transition = vi.fn(async () => placed);
    const { fixture, el } = await render(
      {
        ...placed,
        status: 'ready',
        paymentMethod: 'cash',
        paymentState: 'not-due',
        notifiedStatuses: ['requested', 'approved', 'ready'],
      },
      { transition },
    );
    const confirm = TestBed.inject(ConfirmService);
    const asked = vi.spyOn(confirm, 'askDetailed').mockResolvedValue({
      reason: '',
      checks: { showCustomer: true, notify: true, markPaid: true },
    });

    const complete = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text.actions.complete,
    );
    complete?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(asked.mock.calls[0][0].checks).toContainEqual(
      expect.objectContaining({ key: 'markPaid', checked: true }),
    );
    expect(transition).toHaveBeenCalledWith(
      placed.reference,
      'completed',
      null,
      {
        showCustomer: true,
        notify: true,
        markPaid: true,
      },
    );
  });

  it('keeps quiet on a second walk through a state the customer knows', async () => {
    // Completed, reopened to put the record straight, and completed again:
    // the customer has already been told the order is done, so the mail is
    // offered unticked and the money is not offered at all — it is recorded.
    const { fixture, el } = await render(
      {
        ...placed,
        status: 'ready',
        paymentState: 'paid',
        paidAt: '2026-08-27T09:15:00.000Z',
        notifiedStatuses: ['requested', 'approved', 'ready', 'completed'],
      },
      { transition: vi.fn(async () => placed) },
    );
    const confirm = TestBed.inject(ConfirmService);
    const asked = vi
      .spyOn(confirm, 'askDetailed')
      .mockResolvedValue({ reason: '', checks: {} });

    const complete = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text.actions.complete,
    );
    complete?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(asked.mock.calls[0][0].checks).toEqual([
      expect.objectContaining({ key: 'showCustomer', checked: true }),
      expect.objectContaining({ key: 'notify', checked: false }),
    ]);
  });

  /**
   * The thread (FR-ORD-03, ADR 0051). It is fetched when the panel is opened
   * and each version's differences only when that version is unfolded — an
   * order worked on for a fortnight is a great many whole-order comparisons.
   */
  it('reads the versions, and works out a difference only when asked', async () => {
    const revisions = vi.fn(async () => versions);
    const { fixture, el } = await render(
      { ...placed, revisionNumber: 2 },
      { revisions },
    );

    expect(revisions).not.toHaveBeenCalled();

    const open = [...el.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(text.revisions.subheading),
    );
    open?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revisions).toHaveBeenCalledWith(placed.reference);
    // Each version links at the page that reads it back.
    expect(
      el.querySelector(
        `a[href="/admin/orders/${placed.reference}/revisions/2"]`,
      ),
    ).not.toBeNull();
    expect(el.textContent).toContain('One more box, as agreed.');
    // What the customer sees, and that they were written to about it.
    expect(el.textContent).toContain(text.revisions.customerView);
    expect(el.textContent).toContain('Emailed');

    // The comparison is behind its own fold, and is not run until it opens.
    expect(el.textContent).not.toContain(text.revisions.total);
    const differences = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text.revisions.changes,
    );
    differences?.click();
    fixture.detectChanges();

    expect(el.textContent).toContain(text.revisions.total);
  });

  /** The escape hatch, forwarded as answered: a step taken by mistake is the
   * shop's own business, and their page never says it happened. */
  it('keeps a move off the customer’s page when the tick is cleared', async () => {
    const transition = vi.fn(async () => placed);
    const { fixture, el } = await render(placed, { transition });
    const confirm = TestBed.inject(ConfirmService);
    vi.spyOn(confirm, 'askDetailed').mockResolvedValue({
      reason: '',
      checks: { showCustomer: false, notify: false },
    });

    const approve = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text.actions.approve,
    );
    approve?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(transition).toHaveBeenCalledWith(
      placed.reference,
      'approved',
      null,
      { showCustomer: false, notify: false, markPaid: false },
    );
  });

  /** A move writes a version, so an open thread is stale the moment one lands.
   * Both resources are asked again, not just the one the buttons act on. */
  it('re-reads the thread when the order is moved under it', async () => {
    const revisions = vi.fn(async () => versions);
    const { fixture, el } = await render(
      { ...placed, revisionNumber: 2 },
      { revisions, transition: vi.fn(async () => placed) },
    );
    const confirm = TestBed.inject(ConfirmService);
    vi.spyOn(confirm, 'askDetailed').mockResolvedValue({
      reason: '',
      checks: { showCustomer: true, notify: false },
    });

    const open = [...el.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(text.revisions.subheading),
    );
    open?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(revisions).toHaveBeenCalledTimes(1);

    const approve = [...el.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === text.actions.approve,
    );
    approve?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(revisions).toHaveBeenCalledTimes(2);
  });
});
