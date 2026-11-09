import { Logger } from '@nestjs/common';
import type { Mock, MockInstance } from 'vitest';

import { env } from '../../platform/env';
import { MailDispatcher } from '../../platform/mail/mail-dispatcher';
import { dispatcherOver } from '../../platform/mail/mail-dispatcher.fixture';
import {
  demoMailText,
  demoSharedText,
} from '../../platform/mail/mail-text.fixture';
import { OrderNotifications } from './order-notifications';
import { demoAdminOrder } from './order.fixture';

const currency = { code: 'EUR', locale: 'de-DE' };

/** Who the two order mails go to, and that neither takes an order down
 * (FR-NOTIF-05/06): a customer shown a reference has an order, so a throwing
 * mailer is logged, not propagated. */
describe('OrderNotifications', () => {
  let send: Mock;
  let error: MockInstance;
  let notifications: OrderNotifications;
  let mail: MailDispatcher;

  /** The queue is real: nothing is sent until it drains. */
  const settle = () => mail.flush();

  const staffInbox = env.MAIL_STAFF_TO;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      // The failure paths log; the assertions are about what survives them.
    });
    mail = dispatcherOver(send);
    notifications = new OrderNotifications(
      mail,
      demoMailText,
      demoSharedText,
      currency,
      'UTC',
    );
  });

  afterEach(() => error.mockRestore());

  it('mails the customer and the shop, each to its own address', async () => {
    notifications.placed(demoAdminOrder, 'tok-123');
    await settle();

    expect(send).toHaveBeenCalledTimes(2);
    const [[, customer], [, staff]] = send.mock.calls;
    expect(customer.to).toBe(demoAdminOrder.contact.email);
    expect(staff.to).toBe(staffInbox);
    // A manager reading it on a phone replies to the customer, not to the
    // shop's own inbox.
    expect(staff.replyTo).toBe(demoAdminOrder.contact.email);
  });

  // NFR-LEGAL-10: the terms travel with the customer's receipt only.
  it('attaches the terms to the customer’s receipt and not to the shop’s', async () => {
    const terms = {
      fileName: 'terms-of-sale-2026-09-01.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from('%PDF-'),
    };

    notifications.placed(demoAdminOrder, 'tok-123', [terms]);
    await settle();

    const [[, customer], [, staff]] = send.mock.calls;
    expect(customer.attachments).toEqual([terms]);
    expect(staff.attachments ?? []).toEqual([]);
  });

  describe('a mailer that throws', () => {
    // Each mail is sent independently, so one provider hiccup must not swallow
    // the other message as well.
    it('does not stop the order, nor the second mail', async () => {
      send.mockRejectedValueOnce(new Error('smtp down'));

      notifications.placed(demoAdminOrder, 'tok-123');
      await settle();

      expect(send).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalled();
    });

    it('survives both mails failing', async () => {
      send.mockRejectedValue(new Error('smtp down'));

      notifications.placed(demoAdminOrder, 'tok-123');
      await settle();

      expect(error).toHaveBeenCalledTimes(2);
    });
  });

  /** The token opens the order with no session, so it goes only where it is
   * the only way in: a guest's mail. */
  describe('the capability token', () => {
    const tokenIn = (call: number) => JSON.stringify(send.mock.calls[call][0]);

    it('is mailed to a guest, who has no other way back', async () => {
      notifications.placed(
        { ...demoAdminOrder, customerEmail: null },
        'tok-123',
      );
      await settle();

      expect(tokenIn(0)).toContain('tok-123');
    });

    it('is not mailed to an account holder', async () => {
      notifications.placed(
        { ...demoAdminOrder, customerEmail: 'alex@example.com' },
        'tok-123',
      );
      await settle();

      expect(tokenIn(0)).not.toContain('tok-123');
    });

    it('never reaches the shop’s own copy either way', async () => {
      notifications.placed(
        { ...demoAdminOrder, customerEmail: null },
        'tok-123',
      );
      await settle();

      expect(tokenIn(1)).not.toContain('tok-123');
    });
  });

  /**
   * A customer calling their own order off (FR-NOTIF-07). It is the only move
   * they have, and the only one of theirs the shop's own screens do not
   * announce: the order simply leaves the queue.
   */
  describe('an order the customer calls off', () => {
    it('tells the shop, and replies to the customer', async () => {
      notifications.cancelledByCustomer(demoAdminOrder);
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      const [, envelope] = send.mock.calls[0];
      expect(envelope.to).toBe(staffInbox);
      // As on the arrival notification: a manager rings the customer back.
      expect(envelope.replyTo).toBe(demoAdminOrder.contact.email);
    });

    // They just did this themselves. A confirmation of one's own click is the
    // mail that teaches people to ignore the shop's mail.
    it('writes nothing to the customer', async () => {
      notifications.cancelledByCustomer(demoAdminOrder);
      await settle();

      const recipients = send.mock.calls.map(([, envelope]) => envelope.to);
      expect(recipients).not.toContain(demoAdminOrder.contact.email);
    });

    it('does not take the cancellation down with it', async () => {
      send.mockRejectedValue(new Error('smtp down'));

      notifications.cancelledByCustomer(demoAdminOrder);
      await settle();

      expect(error).toHaveBeenCalled();
    });
  });
});
