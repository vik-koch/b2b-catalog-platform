import type { Mock, MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { SyncRun, SyncRunStatus } from '@b2b-catalog-platform/shared';
import { MailService } from '../mail/mail.service';
import { demoMailText } from '../mail/mail-text.fixture';
import { NotificationAudiences } from '../mail/notification-audience';
import { SyncNotifications } from './sync-notifications';

const currency = { code: 'EUR', locale: 'de-DE' };
const ADMIN = 'admin@example.com';
const OPS = 'ops@example.com';

const run = (status: SyncRunStatus, over: Partial<SyncRun> = {}): SyncRun => ({
  id: '1a2b3c4d-0000-4000-8000-00000000abcd',
  status,
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

  const subjects = () =>
    send.mock.calls.map((call) => (call[0] as { subject: string }).subject);
  const recipients = () =>
    send.mock.calls.map((call) => (call[1] as { to: string }).to);

  const t = demoMailText.syncRun.kinds;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      // The failure path logs; the assertions are about what survives it.
    });
    notifications = new SyncNotifications(
      { send } as unknown as MailService,
      new NotificationAudiences({ admin: ADMIN }),
      demoMailText,
      currency,
    );
  });

  afterEach(() => error.mockRestore());

  it('announces the first failure after the feed was working', async () => {
    await notifications.announce(run('failed'), 'applied');

    expect(subjects()).toEqual([t.failed.subject]);
  });

  it('says nothing about a feed that is still broken', async () => {
    await notifications.announce(run('failed'), 'failed');

    expect(send).not.toHaveBeenCalled();
  });

  it('announces the recovery once', async () => {
    await notifications.announce(run('applied'), 'failed');

    expect(subjects()).toEqual([t.recovered.subject]);
  });

  it('announces a run that starts waiting for a person', async () => {
    await notifications.announce(run('previewed'), 'applied');

    expect(subjects()).toEqual([t.waiting.subject]);
  });

  /**
   * The case a hold would have been built for: a staged run superseded by
   * another staged run, every twenty minutes, is one thing waiting — and the
   * panel says so with one count.
   */
  it('says nothing when a staged run replaces a staged run', async () => {
    await notifications.announce(run('previewed'), 'previewed');
    await notifications.announce(run('previewed'), 'superseded');

    expect(send).not.toHaveBeenCalled();
  });

  /** A discarded run was answered, so the next one waiting is news again. */
  it('announces a staged run after the last one was discarded', async () => {
    await notifications.announce(run('previewed'), 'discarded');

    expect(subjects()).toEqual([t.waiting.subject]);
  });

  it('announces new products a run applied by itself', async () => {
    await notifications.announce(run('applied', withCreates(12)), 'applied');

    expect(subjects()).toEqual([t.created.subject]);
  });

  it('says nothing about a run that created nothing', async () => {
    await notifications.announce(run('applied', withCreates(0)), 'applied');

    expect(send).not.toHaveBeenCalled();
  });

  /**
   * An admin applying a staged run has just read the preview that says what it
   * creates; the mail would be the same news twice.
   */
  it('says nothing about creates an admin applied by hand', async () => {
    await notifications.announce(
      run('applied', { ...withCreates(12), stagedReason: 'policy' }),
      'applied',
    );

    expect(send).not.toHaveBeenCalled();
  });

  it('writes both sentences where one run recovers and creates', async () => {
    await notifications.announce(run('applied', withCreates(12)), 'failed');

    expect(subjects()).toEqual([t.recovered.subject, t.created.subject]);
  });

  it('treats the very first run as a feed that was working', async () => {
    await notifications.announce(run('applied'), null);

    expect(send).not.toHaveBeenCalled();
  });

  it('writes to the admin, not to the staff inbox', async () => {
    await notifications.announce(run('previewed'), 'applied');

    expect(recipients()).toEqual([ADMIN]);
  });

  /** A fault reaches the operator as well, where a deployment names one — and
   * only a fault: a staged run is nothing they can answer. */
  it('copies the operator on a failure and on nothing else', async () => {
    notifications = new SyncNotifications(
      { send } as unknown as MailService,
      new NotificationAudiences({ admin: ADMIN, ops: OPS }),
      demoMailText,
      currency,
    );

    await notifications.announce(run('failed'), 'applied');
    await notifications.announce(run('previewed'), 'applied');

    expect(recipients()).toEqual([ADMIN, OPS, ADMIN]);
  });

  /** A catalog that imported and a message about it are not one event. */
  it('does not let a broken mailer escape into the run', async () => {
    send.mockRejectedValue(new Error('smtp down'));

    await expect(
      notifications.announce(run('failed'), 'applied'),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
