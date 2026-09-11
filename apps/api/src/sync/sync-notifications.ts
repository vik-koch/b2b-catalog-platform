import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MoneyFormat,
  SyncRun,
  SyncRunStatus,
} from '@b2b-catalog-platform/shared';
import { MONEY_FORMAT } from '../config/deployment-config';
import { MailService } from '../mail/mail.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import {
  NotificationAudience,
  NotificationAudiences,
} from '../mail/notification-audience';
import { MailContent } from '../mail/mail-layout';
import {
  syncCreatedMail,
  syncFailedMail,
  syncRecoveredMail,
  syncWaitingMail,
} from '../mail/templates/sync-run.template';

/**
 * Where an automated feed stands, as far as anybody has been told.
 *
 * Not a stored field. It is read off the run before this one, which is the
 * same fact and cannot drift from it — and a feed that runs every twenty
 * minutes would otherwise accumulate a flag nobody clears.
 */
type FeedState = 'ok' | 'waiting' | 'failed';

/**
 * What each outcome means for the feed's state.
 *
 * `superseded` is still `waiting`: the run it describes was staged and nobody
 * answered it, a later one simply took its place. `discarded` is `ok` —
 * somebody said no, which is an answer, and the next staged run is news again.
 */
const STATE_OF: Record<SyncRunStatus, FeedState> = {
  applied: 'ok',
  'no-change': 'ok',
  discarded: 'ok',
  previewed: 'waiting',
  superseded: 'waiting',
  failed: 'failed',
};

/**
 * What an automated catalog sync tells the shop (FR-ADM-07/09).
 *
 * Three of the four mails are sent on a **change of state**, not on a run:
 * the first failure after things were working, the recovery, and the moment
 * something starts waiting for a person. A feed on a twenty-minute cadence
 * that breaks at midnight would otherwise write seventy-two identical mails
 * before anybody opened one, and the seventy-second is the one that teaches
 * people to filter the shop's mail into a folder.
 *
 * The panel is the channel that does not depend on any of this: the staged
 * count and the last-sync line are read off the runs themselves, so a mail
 * that never arrives — no SMTP, a wrong address — costs the news, never the
 * record. Which is why nothing here is retried and nothing fails a run: a
 * catalog that imported and a message about it are not the same event.
 */
@Injectable()
export class SyncNotifications {
  private readonly logger = new Logger('Sync');

  constructor(
    private readonly mail: MailService,
    private readonly audiences: NotificationAudiences,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(MONEY_FORMAT) private readonly currency: MoneyFormat,
  ) {}

  /**
   * Announce one finished automated run, given the state the feed was in
   * before it — the status of the machine run before this one, or null where
   * this is the first one ever.
   *
   * Read *before* the run is written, because inserting one supersedes the
   * staged run it overtakes: asked afterwards, the question answers itself.
   */
  async announce(run: SyncRun, previous: SyncRunStatus | null): Promise<void> {
    const before: FeedState = previous ? STATE_OF[previous] : 'ok';
    const now = STATE_OF[run.status];

    if (now === 'failed' && before !== 'failed') {
      await this.send(syncFailedMail(run, this.when(run), this.text), 'fault');
      return;
    }
    if (before === 'failed' && now !== 'failed') {
      await this.send(
        syncRecoveredMail(run, this.when(run), this.text),
        'fault',
      );
      // A run can recover the feed and bring new products in one go. Two
      // mails, because they are two pieces of news: one is about the
      // connection, the other is about work on somebody's desk.
    }
    if (now === 'waiting' && before !== 'waiting') {
      await this.send(
        syncWaitingMail(run, this.when(run), this.text),
        'admins',
      );
      return;
    }
    // Applied and brought products nobody has published yet (FR-ADM-06). Not a
    // transition: every such run is its own piece of news, and there is no
    // state for it to be in. A staged run an admin applied by hand says
    // nothing here — they have just read the preview that says it.
    if (run.status === 'applied' && !run.stagedReason && run.summary?.create) {
      await this.send(
        syncCreatedMail(run, this.when(run), this.text),
        'admins',
      );
    }
  }

  private when(run: SyncRun): string {
    return new Intl.DateTimeFormat(this.currency.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(run.startedAt));
  }

  /**
   * Never allowed to fail the run that caused it, exactly as an order's mails
   * are not allowed to fail the order: the catalog is written, and the panel
   * says so whether or not SMTP was reachable.
   */
  private async send(
    content: MailContent,
    audience: NotificationAudience,
  ): Promise<void> {
    try {
      for (const to of this.audiences.addressesFor(audience)) {
        await this.mail.send(content, { to });
      }
    } catch (error) {
      this.logger.error(
        `sync notification failed: ${(error as Error).message}`,
      );
    }
  }
}
