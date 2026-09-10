import { fillText, formatPersonName } from '@b2b-catalog-platform/shared';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/** What the notification reports — the account, as it was before it went. */
export interface ClosedAccountSummary {
  readonly email: string;
  /** Null on an account that never carried one — nothing enforces a name on
   * a staff-created row. */
  readonly firstName: string | null;
  readonly lastName: string | null;
  /** Orders the closure anonymized and kept (FR-AUTH-06). */
  readonly orders: number;
  /** How many of those have not ended: the shop's own open items, now with
   * nobody to ring about them. */
  readonly openOrders: number;
}

/**
 * Sent to the shop when an account closes itself (FR-NOTIF-08).
 *
 * The mail carries the account rather than linking to it, because by the time
 * anybody reads this the row no longer says who it was: deletion anonymizes.
 * That is also why the counts are here — the orders stay, and an open one is
 * now the shop's to settle with a customer it can no longer look up.
 */
export function accountClosedMail(
  account: ClosedAccountSummary,
  text: MailText,
): MailContent {
  const t = text.accountClosed;

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
      { label: t.emailLabel, value: account.email },
      {
        label: t.ordersLabel,
        value: String(account.orders),
      },
    ],
    action: { label: t.action, path: '/admin/orders' },
  };
}
