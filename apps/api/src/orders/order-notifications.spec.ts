import type { Mock, MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { demoMailText } from '../mail/mail-text.fixture';
import { env } from '../env';
import { OrderNotifications } from './order-notifications';
import { demoAdminOrder } from './order.fixture';

const currency = { code: 'EUR', locale: 'de-DE' };

/**
 * What the two order mails are addressed to, and — the point of the file — that
 * neither can take an order down with it (FR-NOTIF-05/06).
 *
 * A customer who has been shown a reference has an order. SMTP being reachable
 * is not part of that promise, so a mailer that throws must be logged and left
 * behind rather than propagated into the submission that placed the row.
 */
describe('OrderNotifications', () => {
  let send: Mock;
  let error: MockInstance;
  let notifications: OrderNotifications;

  const staffInbox = env.MAIL_STAFF_TO;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      // The failure paths log; the assertions are about what survives them.
    });
    notifications = new OrderNotifications(
      { send } as unknown as MailService,
      demoMailText,
      currency,
    );
  });

  afterEach(() => error.mockRestore());

  it('mails the customer and the shop, each to its own address', async () => {
    await notifications.placed(demoAdminOrder, 'tok-123');

    expect(send).toHaveBeenCalledTimes(2);
    const [[, customer], [, staff]] = send.mock.calls;
    expect(customer.to).toBe(demoAdminOrder.contact.email);
    expect(staff.to).toBe(staffInbox);
    // A manager reading it on a phone replies to the customer, not to the
    // shop's own inbox.
    expect(staff.replyTo).toBe(demoAdminOrder.contact.email);
  });

  describe('a mailer that throws', () => {
    // Each mail is sent independently, so one provider hiccup must not swallow
    // the other message as well.
    it('does not stop the order, nor the second mail', async () => {
      send.mockRejectedValueOnce(new Error('smtp down'));

      await expect(
        notifications.placed(demoAdminOrder, 'tok-123'),
      ).resolves.toBeUndefined();

      expect(send).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalled();
    });

    it('survives both mails failing', async () => {
      send.mockRejectedValue(new Error('smtp down'));

      await expect(
        notifications.placed(demoAdminOrder, 'tok-123'),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * The token is a capability: it opens the order with no session at all. It
   * therefore travels only where it is the only way in — a guest's mail — and
   * never to somebody who can already open the order signed in (ADR 0038).
   */
  describe('the capability token', () => {
    const tokenIn = (call: number) => JSON.stringify(send.mock.calls[call][0]);

    it('is mailed to a guest, who has no other way back', async () => {
      await notifications.placed(
        { ...demoAdminOrder, customerEmail: null },
        'tok-123',
      );

      expect(tokenIn(0)).toContain('tok-123');
    });

    it('is not mailed to an account holder', async () => {
      await notifications.placed(
        { ...demoAdminOrder, customerEmail: 'alex@example.com' },
        'tok-123',
      );

      expect(tokenIn(0)).not.toContain('tok-123');
    });

    it('never reaches the shop’s own copy either way', async () => {
      await notifications.placed(
        { ...demoAdminOrder, customerEmail: null },
        'tok-123',
      );

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
      await notifications.cancelledByCustomer(demoAdminOrder);

      expect(send).toHaveBeenCalledTimes(1);
      const [, envelope] = send.mock.calls[0];
      expect(envelope.to).toBe(staffInbox);
      // As on the arrival notification: a manager rings the customer back.
      expect(envelope.replyTo).toBe(demoAdminOrder.contact.email);
    });

    // They just did this themselves. A confirmation of one's own click is the
    // mail that teaches people to ignore the shop's mail.
    it('writes nothing to the customer', async () => {
      await notifications.cancelledByCustomer(demoAdminOrder);

      const recipients = send.mock.calls.map(([, envelope]) => envelope.to);
      expect(recipients).not.toContain(demoAdminOrder.contact.email);
    });

    it('does not take the cancellation down with it', async () => {
      send.mockRejectedValue(new Error('smtp down'));

      await expect(
        notifications.cancelledByCustomer(demoAdminOrder),
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    });
  });
});
