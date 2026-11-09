import { formatPersonName } from '@b2b-catalog-platform/shared/core/accounts';
import { fillText, SharedText } from '@b2b-catalog-platform/shared/platform';

import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';
import { accountsMail } from './accounts-mail-text';

/** The account as it was before it went. */
export interface ClosedAccountSummary {
  readonly email: string;
  /** Null where there was none: nothing requires a name on a staff-created
   * account. */
  readonly firstName: string | null;
  readonly lastName: string | null;
  /** Orders the closure anonymized and kept (FR-AUTH-06). */
  readonly orders: number;
  /** How many of those have not ended: the shop's own open items, now with
   * nobody to ring about them. */
  readonly openOrders: number;
}

/**
 * Sent to the shop when an account closes itself (FR-NOTIF-08). It carries
 * the account instead of a link, as the row is anonymized by then, and the
 * counts, as an open order is now the shop's to settle with a customer it
 * cannot look up.
 */
export function accountClosedMail(
  account: ClosedAccountSummary,
  text: MailText,
  common: SharedText,
): MailContent {
  const t = accountsMail(text).accountClosed;

  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [
      t.body,
      // Only where something is still open. On a closed account with nothing
      // outstanding there is nothing to do, and a standing sentence saying so
      // would train staff to skip the one that matters.
      ...(account.openOrders > 0
        ? [fillText(t.openOrdersNote, { count: account.openOrders })]
        : []),
    ],
    rows: [
      // Dropped rather than shown empty where the account carried no name:
      // the address below is the identity either way.
      ...(formatPersonName(account.firstName, account.lastName)
        ? [
            {
              label: t.nameLabel,
              value: formatPersonName(account.firstName, account.lastName),
            },
          ]
        : []),
      { label: common.fields.email.label, value: account.email },
      {
        label: t.ordersLabel,
        value: String(account.orders),
      },
    ],
    action: { label: t.action, path: '/admin/orders' },
  };
}
