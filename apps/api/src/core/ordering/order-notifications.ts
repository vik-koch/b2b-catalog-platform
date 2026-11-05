import { Inject, Injectable } from '@nestjs/common';
import { SharedText, MoneyFormat } from '@b2b-catalog-platform/shared/platform';
import {
  OrderDocumentKind,
  AdminOrderDetail,
  OrderNotice,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  MONEY_FORMAT,
  SHOP_TIME_ZONE,
} from '../../platform/config/deployment-config';
import { MailDispatcher } from '../../platform/mail/mail-dispatcher';
import { MAIL_TEXT, MailText } from '../../platform/mail/mail-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { newOrderMail } from './mail/new-order.template';
import { orderCancelledMail } from './mail/order-cancelled.template';
import { orderReceivedMail } from './mail/order-received.template';
import { orderDocumentMail } from './mail/order-document.template';
import { orderStatusChangedMail } from './mail/order-status.template';
import { MailAttachment } from '../../platform/mail/mailer';
import { env } from '../../platform/env';

/** Narrows the configured staff inbox, which env.ts requires in server mode. */
function staffInbox(): string {
  const inbox = env.MAIL_STAFF_TO;
  if (!inbox) throw new Error('MAIL_STAFF_TO is not configured');
  return inbox;
}

/**
 * The mails about an order (FR-NOTIF-03/05/06/07, FR-ORD-05). Dispatched, not
 * sent: the order stands whether or not SMTP answers, and nobody waits on it.
 */
@Injectable()
export class OrderNotifications {
  constructor(
    private readonly mail: MailDispatcher,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(SHARED_TEXT) private readonly common: SharedText,
    @Inject(MONEY_FORMAT) private readonly currency: MoneyFormat,
    @Inject(SHOP_TIME_ZONE) private readonly timeZone: string,
  ) {}

  async placed(
    order: AdminOrderDetail,
    publicToken: string,
    /** The accepted terms as a document, where the deployment attaches them
     * (NFR-LEGAL-10). */
    attachments: readonly MailAttachment[] = [],
  ): Promise<void> {
    // To the order's contact, not the account: a guest has none, and a customer
    // may have named a colleague. The token travels only where it is the only
    // way in.
    await this.mail.dispatch(
      orderReceivedMail(
        order,
        order.customerEmail ? null : publicToken,
        this.currency,
        this.text,
        this.common,
        this.timeZone,
      ),
      { to: order.contact.email, attachments },
      'order confirmation',
    );

    await this.mail.dispatch(
      newOrderMail(order, this.currency, this.text, this.common),
      {
        // A deployment that lost it logs one failed mail, not the customer's.
        to: staffInbox(),
        // A manager on a phone replies to the customer, not the shop's inbox.
        replyTo: order.contact.email,
      },
      'staff order notification',
    );
  }

  /**
   * The shop's mail when a customer calls their order off (FR-NOTIF-07).
   * Nothing to the customer: a confirmation of one's own click teaches people
   * to ignore the shop's mail.
   */
  async cancelledByCustomer(order: AdminOrderDetail): Promise<void> {
    await this.mail.dispatch(
      orderCancelledMail(order, this.currency, this.text, this.common),
      {
        to: staffInbox(),
        // As on the arrival notification.
        replyTo: order.contact.email,
      },
      'staff cancellation notification',
    );
  }

  /**
   * The customer's mail about their order (FR-NOTIF-03), to the order's
   * contact. `notice` says why it exists: a move, a step back, or a change.
   */
  async statusChanged(
    order: AdminOrderDetail,
    publicToken: string,
    notice: OrderNotice,
    /** The shop's notes since they were last told (FR-ORD-03), oldest first. */
    changes: readonly string[] = [],
    /** The payment instructions where money is asked for (FR-ORD-05). */
    attachments: readonly MailAttachment[] = [],
  ): Promise<void> {
    const status = order.status;
    await this.mail.dispatch(
      orderStatusChangedMail(
        order,
        status,
        notice,
        order.customerEmail ? null : publicToken,
        this.currency,
        this.text,
        this.common,
        changes,
        attachments.length > 0,
      ),
      { to: order.contact.email, attachments },
      'order status mail',
    );
  }

  /**
   * A document arriving, on its own (FR-ORD-05). Payment instructions are
   * attached; a summary is linked, since an attachment freezes one version.
   */
  async documentSupplied(
    order: AdminOrderDetail,
    kind: OrderDocumentKind,
    publicToken: string,
    attachments: readonly MailAttachment[] = [],
  ): Promise<void> {
    await this.mail.dispatch(
      orderDocumentMail(
        order,
        kind,
        order.customerEmail ? null : publicToken,
        this.currency,
        this.text,
        this.common,
      ),
      { to: order.contact.email, attachments },
      'order document mail',
    );
  }
}
