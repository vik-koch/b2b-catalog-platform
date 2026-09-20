import type { Mock, MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { SyncArea, SyncRun, SyncRunStatus } from '@b2b-catalog-platform/shared';
import { MailDispatcher } from '../mail/mail-dispatcher';
import { dispatcherOver } from '../mail/mail-dispatcher.fixture';
import { demoMailText } from '../mail/mail-text.fixture';
import { NotificationAudiences } from '../mail/notification-audience';
import { SyncNotifications } from './sync-notifications';

const currency = { code: 'EUR', locale: 'de-DE' };
const ADMIN = 'admin@example.com';
const OPS = 'ops@example.com';

const run = (status: SyncRunStatus, over: Partial<SyncRun> = {}): SyncRun => ({
  id: '1a2b3c4d-0000-4000-8000-00000000abcd',
  status,
  area: 'catalog',
  source: 'api',
  filename: 'nightly',
  startedAt: '2026-03-14T03:15:00.000Z',
  finishedAt: '2026-03-14T03:15:30.000Z',
  actorEmail: null,
  tokenName: 'ERP nightly export',
  stagedReason: status === 'previewed' ? 'policy' : null,
  options: null,
  summary: null,
  error: status === 'failed' ? 'export ended early' : null,
  ...over,
});

/** The same run in another area. What it is about is the run's own field, so
 * this is the whole of the difference at this level. */
const inArea = (area: SyncArea): Partial<SyncRun> => ({ area });

const withCreates = (create: number): Partial<SyncRun> => ({
  summary: {
    rows: create,
    create,
    update: 0,
    softDelete: 0,
    restore: 0,
    unchanged: 0,
    categoriesCreated: 0,
    categoriesRenamed: 0,
    keptManual: 0,
    errors: 0,
    fields: [],
  },
});

/**
 * What an automated feed writes to the shop, and — the substance of the file —
 * what it does *not* write. Three of the four mails are sent on a change of
 * state, so the cases that matter most here are the silent ones: a feed that
 * is still broken, and a queue that is still waiting.
 */
describe('SyncNotifications', () => {
  let send: Mock;
  let error: MockInstance;
  let notifications: SyncNotifications;
  let mail: MailDispatcher;

  /** The queue is real: nothing is sent until it drains. */
  const settle = () => mail.flush();

  const subjects = () =>
    send.mock.calls.map((call) => (call[0] as { subject: string }).subject);
  const recipients = () =>
    send.mock.calls.map((call) => (call[1] as { to: string }).to);

  const t = demoMailText.syncRun.areas.catalog;
  const customers = demoMailText.syncRun.areas.customers;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      // The failure path logs; the assertions are about what survives it.
    });
    mail = dispatcherOver(send);
    notifications = new SyncNotifications(
      mail,
      new NotificationAudiences({ admin: ADMIN }),
      demoMailText,
      currency,
    );
  });

  afterEach(() => error.mockRestore());

  it('announces the first failure after the feed was working', async () => {
    notifications.announce(run('failed'), 'applied');
    await settle();

    expect(subjects()).toEqual([t.failed.subject]);
  });

  it('says nothing about a feed that is still broken', async () => {
    notifications.announce(run('failed'), 'failed');
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it('announces the recovery once', async () => {
    notifications.announce(run('applied'), 'failed');
    await settle();

    expect(subjects()).toEqual([t.recovered.subject]);
  });

  it('announces a run that starts waiting for a person', async () => {
    notifications.announce(run('previewed'), 'applied');
    await settle();

    expect(subjects()).toEqual([t.waiting.subject]);
  });

  /**
   * The case a hold would have been built for: a staged run superseded by
   * another staged run, every twenty minutes, is one thing waiting — and the
   * panel says so with one count.
   */
  it('says nothing when a staged run replaces a staged run', async () => {
    notifications.announce(run('previewed'), 'previewed');
    notifications.announce(run('previewed'), 'superseded');
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  /** A discarded run was answered, so the next one waiting is news again. */
  it('announces a staged run after the last one was discarded', async () => {
    notifications.announce(run('previewed'), 'discarded');
    await settle();

    expect(subjects()).toEqual([t.waiting.subject]);
  });

  it('announces new products a run applied by itself', async () => {
    notifications.announce(run('applied', withCreates(12)), 'applied');
    await settle();

    expect(subjects()).toEqual([t.created.subject]);
  });

  it('says nothing about a run that created nothing', async () => {
    notifications.announce(run('applied', withCreates(0)), 'applied');
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  /**
   * An admin applying a staged run has just read the preview that says what it
   * creates; the mail would be the same news twice.
   */
  it('says nothing about creates an admin applied by hand', async () => {
    notifications.announce(
      run('applied', { ...withCreates(12), stagedReason: 'policy' }),
      'applied',
    );
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it('writes both sentences where one run recovers and creates', async () => {
    notifications.announce(run('applied', withCreates(12)), 'failed');
    await settle();

    expect(subjects()).toEqual([t.recovered.subject, t.created.subject]);
  });

  it('treats the very first run as a feed that was working', async () => {
    notifications.announce(run('applied'), null);
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it('writes to the admin, not to the staff inbox', async () => {
    notifications.announce(run('previewed'), 'applied');
    await settle();

    expect(recipients()).toEqual([ADMIN]);
  });

  /** A fault reaches the operator as well, where a deployment names one — and
   * only a fault: a staged run is nothing they can answer. */
  it('copies the operator on a failure and on nothing else', async () => {
    mail = dispatcherOver(send);
    notifications = new SyncNotifications(
      mail,
      new NotificationAudiences({ admin: ADMIN, ops: OPS }),
      demoMailText,
      currency,
    );

    notifications.announce(run('failed'), 'applied');
    notifications.announce(run('previewed'), 'applied');
    await settle();

    // Sorted: the queue sends in parallel, so which of the two fault copies
    // lands first is not a fact about the notification.
    expect(recipients().sort()).toEqual([ADMIN, ADMIN, OPS]);
  });

  /**
   * The area decides the words (FR-NOTIF-09). A manager who gets "Catalog
   * update failed" about an account import learns the wrong thing in the one
   * line an inbox shows them.
   */
  it('writes a customer run in the customer exchange’s own words', async () => {
    notifications.announce(run('failed', inArea('customers')), 'applied');
    notifications.announce(run('previewed', inArea('customers')), 'applied');
    await settle();

    expect(subjects()).toEqual([
      customers.failed.subject,
      customers.waiting.subject,
    ]);
  });

  /**
   * No customer counterpart to "new products arrived": the accounts a run
   * invited have already been mailed their own set-a-password link, so there
   * is no queue on anybody's desk to announce.
   */
  it('says nothing about accounts a customer run created', async () => {
    notifications.announce(
      run('applied', { ...inArea('customers'), ...withCreates(12) }),
      'applied',
    );
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  /**
   * The two feeds are two facts. The caller reads each area's own previous
   * run, so a customer run recovering says nothing about a catalog feed that
   * is still down — and cannot clear it.
   */
  it('reads each area against its own previous run', async () => {
    notifications.announce(run('applied', inArea('customers')), 'failed');
    notifications.announce(run('failed'), 'failed');
    await settle();

    expect(subjects()).toEqual([customers.recovered.subject]);
  });

  /** A catalog that imported and a message about it are not one event. */
  it('does not let a broken mailer escape into the run', async () => {
    send.mockRejectedValue(new Error('smtp down'));

    notifications.announce(run('failed'), 'applied');
    await settle();

    expect(error).toHaveBeenCalled();
  });
});
