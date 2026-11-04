import { Inject, Injectable } from '@nestjs/common';
import { env } from '../env';

/**
 * Who inside the shop a message is for.
 *
 * Not a list of addresses at the call site: a template knows what it is
 * saying, and who needs to read that is a property of the message, not of the
 * code that happens to send it. Two audiences today, both about the platform
 * talking to the people who run it rather than to a customer:
 *
 * - `admins` — a decision to take or news to act on, in the admin panel.
 * - `fault` — something the platform depends on has broken. The admin is told
 *   whatever else happens: they cannot fix an exchange, but they are the one
 *   who notices the shop going stale and who asks. Where a deployment names an
 *   operator, they get a copy.
 *
 * The order exchange (FR-ADM-08) inherits both unchanged: an exchange that
 * stopped is a fault, an order that came back needing a person is the admins'.
 */
export type NotificationAudience = 'admins' | 'fault';

/** The two addresses the shop itself is written to, as the deployment sets
 * them. Loaded once like the branding and the wording, rather than read out of
 * `env` where it is used, so a spec can hand over a different pair. */
export interface NotificationAddresses {
  readonly admin: string;
  readonly ops?: string;
}
export const NOTIFICATION_ADDRESSES = 'NOTIFICATION_ADDRESSES';

export function loadNotificationAddresses(): NotificationAddresses {
  // env.ts requires this in server mode; asking again here means a deployment
  // that lost it fails where the message is built rather than sending to
  // `undefined`.
  if (!env.MAIL_ADMIN_TO) throw new Error('MAIL_ADMIN_TO is not configured');
  return { admin: env.MAIL_ADMIN_TO, ops: env.MAIL_OPS_TO };
}

@Injectable()
export class NotificationAudiences {
  constructor(
    @Inject(NOTIFICATION_ADDRESSES)
    private readonly addresses: NotificationAddresses,
  ) {}

  /**
   * The addresses to write to. The admin is in both, so neither audience can
   * come back empty — a fault with no reader would be the one piece of news
   * nobody hears.
   */
  addressesFor(audience: NotificationAudience): readonly string[] {
    const { admin, ops } = this.addresses;
    // A deployment that points both at one mailbox gets one message, not two.
    return audience === 'fault' && ops && ops !== admin
      ? [admin, ops]
      : [admin];
  }
}
