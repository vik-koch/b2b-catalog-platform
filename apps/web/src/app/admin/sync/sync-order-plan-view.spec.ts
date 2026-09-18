import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  OrderSyncPlan,
  OrderWriteResult,
  SyncSummary,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { SyncOrderPlanView } from './sync-order-plan-view';

const text = defaultAdminText.sync;

const summary = (over: Partial<SyncSummary> = {}): SyncSummary => ({
  rows: 3,
  create: 0,
  update: 2,
  softDelete: 0,
  restore: 0,
  unchanged: 1,
  categoriesCreated: 0,
  categoriesRenamed: 0,
  categoriesEmptied: 0,
  keptManual: 0,
  mailed: 0,
  claimed: 0,
  claimedById: 0,
  errors: 0,
  fields: [],
  ...over,
});

const answered = (over: Partial<OrderWriteResult> = {}): OrderWriteResult => ({
  reference: 'KO-260918-0001',
  kind: 'transition',
  status: 'approved',
  paymentState: 'awaiting',
  revisionNumber: 2,
  notified: false,
  ...over,
});

@Component({
  imports: [SyncOrderPlanView],
  template: `<app-sync-order-plan-view [plan]="plan()" />`,
})
class Host {
  readonly plan = signal<OrderSyncPlan>({
    summary: summary(),
    orders: [],
    rowErrors: [],
    truncated: false,
  });
}

async function render(plan: Partial<OrderSyncPlan> = {}) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.plan.update((current) => ({ ...current, ...plan }));
  await fixture.whenStable();
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement };
}

/**
 * The order run's own summary. It is always a record — an order run is applied
 * as it arrives — so what this has to get right is what it says, not what it
 * offers to do.
 */
describe('SyncOrderPlanView', () => {
  it('lists what it answered, and links each order to itself', async () => {
    const { el } = await render({
      orders: [answered(), answered({ reference: 'KO-260918-0002' })],
    });

    expect(el.textContent).toContain('KO-260918-0001');
    expect(
      el.querySelector('a[href="/admin/orders/KO-260918-0001"]'),
    ).not.toBeNull();
    expect(el.textContent).toContain(text.orders.kind.transition);
  });

  /** A feed that re-sends everything it holds would otherwise fill the page
   * with orders nothing happened to. The count still says how many. */
  it('counts an unchanged order without listing it', async () => {
    const { el } = await render({
      orders: [answered({ reference: 'KO-260918-0003', kind: 'unchanged' })],
      summary: summary({ update: 0, unchanged: 1 }),
    });

    expect(el.textContent).not.toContain('KO-260918-0003');
    expect(el.textContent).toContain(text.orders.count.unchanged);
  });

  it('says why an instruction was skipped, in the deployment’s words', async () => {
    const { el } = await render({
      summary: summary({ update: 0, unchanged: 0, errors: 1 }),
      rowErrors: [
        {
          row: 1,
          reference: 'KO-260918-0004',
          code: 'order-changed',
          params: { reference: 'KO-260918-0004', current: '5' },
        },
      ],
    });

    expect(el.textContent).toContain(text.errorsTitle);
    // The values from the sending system's own data, substituted into the
    // deployment's sentence rather than restated by the component.
    expect(el.textContent).toContain('KO-260918-0004');
    expect(el.textContent).toContain('5');
  });

  /** Nothing to apply and nothing to discard, ever: the buttons the other two
   * plan views carry would be pressing something that already happened. */
  it('offers no decision at all', async () => {
    const { el } = await render({ orders: [answered()] });

    expect(el.querySelector('button')).toBeNull();
  });
});
