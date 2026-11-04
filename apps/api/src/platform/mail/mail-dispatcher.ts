import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../env';
import { MailContent } from './mail-layout';
import { MailEnvelope, MailService } from './mail.service';

/**
 * How many messages may be in flight at once.
 *
 * Not one: a single chain means every message waits behind the slowest one
 * before it, so a run that invites fifty accounts leaves the last one minutes
 * late. Not unbounded either — a burst would open a connection per message and
 * a real provider rate-limits that. A handful keeps a normal request's mail
 * immediate and a bulk run polite.
 */
const MAX_IN_FLIGHT = 4;

/**
 * Sending mail without making somebody wait for it.
 *
 * A real SMTP provider takes seconds to accept a message — long enough that a
 * customer pressing "send order" sat looking at a disabled button while the
 * order had already been written. Nothing on those paths reads the result:
 * every one of them logged a failure and carried on, because the row is what
 * matters and staff can see it whether or not SMTP was reachable. So the send
 * is handed here and the request returns.
 *
 * Order is not promised. The messages one request produces go to different
 * inboxes, and no reader of one is waiting on the other.
 *
 * Use `MailService` directly where the mail *is* the answer — a screen whose
 * whole point is "did it go out?" has to wait and be told.
 *
 * `MAIL_DELIVERY=inline` makes a dispatch send before it returns. That is the
 * e2e suite's setting and nothing else's: those specs assert *which* mails a
 * move produces, and an inbox read for a message still in a queue is a race
 * rather than a test.
 */
@Injectable()
export class MailDispatcher implements OnApplicationShutdown {
  private readonly logger = new Logger('Mail');
  private readonly queued: (() => Promise<void>)[] = [];
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly mail: MailService) {}

  /**
   * Hand over one message. `what` names it in the log if it does not go out.
   *
   * Awaited by its callers, and under `queued` that await costs nothing: the
   * promise is already resolved by the time they have it. Under `inline` the
   * same await is what holds the request until the message has gone.
   */
  dispatch(
    content: MailContent,
    envelope: MailEnvelope,
    what: string,
  ): Promise<void> {
    const send = async () => {
      try {
        await this.mail.send(content, envelope);
      } catch (error) {
        // Nothing waits on this any more, so the log is the whole report. A
        // message dropped on a provider blip is gone: this is a queue that
        // gets out of the way, not one that guarantees delivery.
        this.logger.error(`Could not send the ${what} mail`, error);
      }
    };
    if (env.MAIL_DELIVERY === 'inline') {
      const running = send().finally(() => this.inFlight.delete(running));
      this.inFlight.add(running);
      return running;
    }
    this.queued.push(send);
    this.pump();
    return Promise.resolve();
  }

  /** Hand over the same message to several addresses, each on its own. */
  async dispatchEach(
    content: MailContent,
    addresses: Iterable<string>,
    what: string,
  ): Promise<void> {
    for (const to of addresses) await this.dispatch(content, { to }, what);
  }

  /** How many are still waiting or in flight — for a spec, and the log below. */
  pending(): number {
    return this.queued.length + this.inFlight.size;
  }

  /** Resolves once everything dispatched so far has been attempted. */
  async flush(): Promise<void> {
    while (this.pending() > 0) {
      await Promise.all([...this.inFlight]);
    }
  }

  /**
   * A deploy replaces the container seconds after the last request; without
   * this, whatever was still queued would go down with it.
   */
  async onApplicationShutdown(): Promise<void> {
    const left = this.pending();
    if (left > 0) this.logger.log(`Flushing ${left} queued message(s)`);
    await this.flush();
  }

  /** Start as many as the ceiling allows, and again as each one finishes. */
  private pump(): void {
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queued.length > 0) {
      const next = this.queued.shift() as () => Promise<void>;
      const running = next().finally(() => {
        this.inFlight.delete(running);
        this.pump();
      });
      this.inFlight.add(running);
    }
  }
}
