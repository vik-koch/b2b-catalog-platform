import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../env';
import { MailContent } from './mail-layout';
import { MailEnvelope, MailService } from './mail.service';

/** Not one, or a bulk run's last mail waits minutes; not unbounded, or a
 * provider rate-limits a connection per message. */
const MAX_IN_FLIGHT = 4;

/**
 * Sends mail off the request path: a provider takes seconds, and no caller
 * acts on the result, as the row is what matters. Order is not promised. Where
 * the mail is the answer ("did it go out?"), use `MailService` and wait.
 * `MAIL_DELIVERY=inline` sends before returning, for the e2e suite.
 */
@Injectable()
export class MailDispatcher implements OnApplicationShutdown {
  private readonly logger = new Logger('Mail');
  private readonly queued: (() => Promise<void>)[] = [];
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly mail: MailService) {}

  /** `what` names the mail in the log if it fails. Awaiting costs nothing when
   * queued, and holds the request when inline. */
  dispatch(
    content: MailContent,
    envelope: MailEnvelope,
    what: string,
  ): Promise<void> {
    const send = async () => {
      try {
        await this.mail.send(content, envelope);
      } catch (error) {
        // The log is the whole report: no retry, no delivery guarantee.
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

  /** Waiting or in flight. */
  pending(): number {
    return this.queued.length + this.inFlight.size;
  }

  /** Resolves once everything dispatched so far has been attempted. */
  async flush(): Promise<void> {
    while (this.pending() > 0) {
      await Promise.all([...this.inFlight]);
    }
  }

  /** A deploy replaces the container seconds after the last request. */
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
