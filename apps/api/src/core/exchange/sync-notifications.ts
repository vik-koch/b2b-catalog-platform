import { Inject, Injectable } from '@nestjs/common';
import {
  SyncRun,
  SyncRunStatus,
} from '@b2b-catalog-platform/shared/core/exchange';
import { MAIL_BRANDING, MailBranding } from '../../mail/mail-branding';
import { MailDispatcher } from '../../mail/mail-dispatcher';
import { MAIL_TEXT, MailText } from '../../mail/mail-text';
import {
  NotificationAudience,
  NotificationAudiences,
} from '../../mail/notification-audience';
import { MailContent } from '../../mail/mail-layout';
import {
  syncCreatedMail,
  syncFailedMail,
  syncRecoveredMail,
  syncWaitingMail,
} from '../../mail/templates/sync-run.template';

/** Where an automated feed stands, read off the run before this one rather
 * than stored, so it cannot drift from it. */
type FeedState = 'ok' | 'waiting' | 'failed';

/** `superseded` is still waiting: nobody answered it, a later run took its
 * place. `discarded` is an answer, so the next staged run is news again. */
const STATE_OF: Record<SyncRunStatus, FeedState> = {
  applied: 'ok',
  'no-change': 'ok',
  discarded: 'ok',
  previewed: 'waiting',
  superseded: 'waiting',
  failed: 'failed',
};

/**
 * What an automated exchange tells the shop (FR-ADM-07/09, FR-NOTIF-09). The
 * feed state is per area, so one area's failure never announces another's
 * recovery; the addresses are the deployment's, not per area. Three of the
 * four mails go on a change of state, or a broken feed would mail on every
 * run. Nothing is retried: the panel reads the runs themselves, so a lost
 * mail costs the news, never the record.
 */
@Injectable()
export class SyncNotifications {
  constructor(
    private readonly mail: MailDispatcher,
    private readonly audiences: NotificationAudiences,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(MAIL_BRANDING) private readonly branding: MailBranding,
  ) {}

  /** `previous` is the area's previous machine run status, or null for the
   * first run (see `SyncRunLog.previousMachineStatus`). */
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
      // A recovering run may also bring work: that is a second mail.
    }
    if (now === 'waiting' && before !== 'waiting') {
      const waiting = syncWaitingMail(run, this.when(run), this.text);
      if (waiting) await this.send(waiting, 'admins');
      return;
    }
    // New unpublished products (FR-ADM-06): news on every such run, not a
    // state. Not for a run applied by hand, whose admin just read the preview,
    // and catalog only: invited customers already have their own mail.
    if (
      run.area === 'catalog' &&
      run.status === 'applied' &&
      !run.stagedReason &&
      run.summary?.create
    ) {
      await this.send(
        syncCreatedMail(run, this.when(run), this.text),
        'admins',
      );
    }
  }

  private when(run: SyncRun): string {
    return new Intl.DateTimeFormat(this.branding.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(run.startedAt));
  }

  /** Never fails or holds up the run: the caller gets its answer without
   * waiting on the mail provider. */
  private send(
    content: MailContent,
    audience: NotificationAudience,
  ): Promise<void> {
    return this.mail.dispatchEach(
      content,
      this.audiences.addressesFor(audience),
      `sync ${audience} notification`,
    );
  }
}
