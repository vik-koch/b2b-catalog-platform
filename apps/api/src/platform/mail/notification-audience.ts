import { Inject, Injectable } from '@nestjs/common';
import { env } from '../env';

/** Who in the shop a message is for, named by the message rather than by an
 * address at the call site. `admins`: a decision or news to act on. `fault`:
 * something the platform depends on broke; the operator gets a copy. */
export type NotificationAudience = 'admins' | 'fault';

/** Provided, not read from `env` where used, so a spec hands over a pair. */
interface NotificationAddresses {
  readonly admin: string;
  readonly ops?: string;
}
export const NOTIFICATION_ADDRESSES = 'NOTIFICATION_ADDRESSES';

export function loadNotificationAddresses(): NotificationAddresses {
  // env.ts requires it in server mode; this narrows the type.
  if (!env.MAIL_ADMIN_TO) throw new Error('MAIL_ADMIN_TO is not configured');
  return { admin: env.MAIL_ADMIN_TO, ops: env.MAIL_OPS_TO };
}

@Injectable()
export class NotificationAudiences {
  constructor(
    @Inject(NOTIFICATION_ADDRESSES)
    private readonly addresses: NotificationAddresses,
  ) {}

  /** The admin is in both, so no audience comes back empty. */
  addressesFor(audience: NotificationAudience): readonly string[] {
    const { admin, ops } = this.addresses;
    // A deployment that points both at one mailbox gets one message, not two.
    return audience === 'fault' && ops && ops !== admin
      ? [admin, ops]
      : [admin];
  }
}
