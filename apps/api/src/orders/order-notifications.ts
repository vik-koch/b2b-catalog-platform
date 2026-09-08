import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AdminOrderDetail,
  MoneyFormat,
  OrderNotice,
} from '@b2b-catalog-platform/shared';
import { MONEY_FORMAT } from '../config/deployment-config';
import { MailService } from '../mail/mail.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { newOrderMail } from '../mail/templates/new-order.template';
import { orderReceivedMail } from '../mail/templates/order-received.template';
import { orderStatusChangedMail } from '../mail/templates/order-status.template';
import { env } from '../env';

/**
 * The two mails an order request produces (FR-NOTIF-05/06).
 *
 * Sent independently and never allowed to fail the request, exactly as a
 * registration's are: the order row is what matters, and it is readable in the
 * admin panel whether or not SMTP was reachable. A customer who was shown a
 * reference has an order, mail or no mail.
 */
@Injectable()
export class OrderNotifications {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly mail: MailService,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(MONEY_FORMAT) private readonly currency: MoneyFormat,
  ) {}

  async placed(order: AdminOrderDetail, publicToken: string): Promise<void> {
    // To the address on the order, not to the account's: a guest has no
    // account, and a signed-in customer may have named a colleague.
    //
    // The token travels only where it is the only way in. An order placed from
    // an account is linked to that account's own order page instead, so no
    // capability URL is mailed for something the customer can already open.
    await this.send(
      () =>
        this.mail.send(
          orderReceivedMail(
            order,
            order.customerEmail ? null : publicToken,
            this.currency,
            this.text,
          ),
          { to: order.contact.email },
        ),
      'order confirmation',
    );

    const staffInbox = env.MAIL_STAFF_TO;
    if (!staffInbox) {
      // env.ts requires this in server mode; this narrows the type.
      throw new Error('MAIL_STAFF_TO is not configured');
    }
    await this.send(
      () =>
        this.mail.send(newOrderMail(order, this.currency, this.text), {
          to: staffInbox,
          // A manager reading it on a phone replies to the customer, not to
          // the shop's own inbox.
          replyTo: order.contact.email,
        }),
      'staff order notification',
    );
  }

  /**
   * The customer's mail about their order (FR-NOTIF-03).
   *
   * To the address on the order, like the receipt — a colleague named as the
   * contact is the person the shop has been talking to about it.
   *
   * `requested` reaches this now: a finished order reopened and told about
   * again is back where it started, and saying so is the honest mail. An order
   * *arriving* is still the receipt's job and never comes through here.
   *
   * `notice` is why this message exists, which the status cannot say: a move
   * on, a move walked back, or a change that moved nothing at all.
   */
  async statusChanged(
    order: AdminOrderDetail,
    publicToken: string,
    notice: OrderNotice,
    /** What the shop said about every change written since this customer was
     * last told (FR-ORD-03), oldest first. Empty on a plain move. */
    changes: readonly string[] = [],
  ): Promise<void> {
    const status = order.status;
    await this.send(
      () =>
        this.mail.send(
          orderStatusChangedMail(
            order,
            status,
            notice,
            order.customerEmail ? null : publicToken,
            this.currency,
            this.text,
            changes,
          ),
          { to: order.contact.email },
        ),
      'order status mail',
    );
  }

  private async send(send: () => Promise<void>, what: string): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error(`Could not send the ${what} mail`, error);
    }
  }
}
