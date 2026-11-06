import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import type { CallResult, SendResult } from './sign-in.service';
import { formatWait, tickingNow } from './countdown';
import { placeholderRuns } from './placeholder-runs';
import { RememberBrowser } from './ui/remember-browser';
import { sendFailureLine } from './send-failure-line';
import { CallStep } from '@b2b-catalog-platform/shared/core/accounts';

/** How often the screen asks whether the call has come. */
const POLL_MS = 3000;

/**
 * Waiting for a call from the account's number, asking every few seconds
 * whether it came; the caller supplies what asking and a new check do. Asking
 * pauses while the tab is hidden and stops once the check is over.
 */
@Component({
  selector: 'app-call-wait',
  imports: [Button, RememberBrowser],
  host: { class: 'block' },
  template: `
    <p class="text-ink-subtle">
      @for (part of intro(); track $index) {
        <span [class]="part.value ? valueClass : ''">{{ part.text }}</span>
      }
    </p>
    @if (step().confirming) {
      <p class="mt-1 text-ink-subtle">
        @for (part of confirmNote(); track $index) {
          <span [class.whitespace-nowrap]="part.value">{{ part.text }}</span>
        }
      </p>
    }

    <div class="mt-6 space-y-6">
      @if (step().rememberDays > 0) {
        <app-remember-browser
          [days]="step().rememberDays"
          [(checked)]="remember"
        />
      }

      @if (!byMail() && !over()) {
        <a uiButton [href]="'tel:' + step().dial" class="tabular-nums">
          {{ fillText(text.callDial, { callTo: step().callTo }) }}
        </a>
      }

      <p
        class="text-sm tabular-nums"
        [class.text-danger]="failed()"
        [class.text-ink-subtle]="!failed()"
        [attr.role]="failed() ? 'alert' : 'status'"
      >
        {{ message() }}
      </p>

      @if (over()) {
        <!-- Counted in figures of one width, so it does not jitter. -->
        <button
          uiButton
          type="button"
          class="tabular-nums"
          [disabled]="busy() || waitLeft() > 0"
          [attr.aria-busy]="busy() || null"
          (click)="renew()"
        >
          {{
            waitLeft() > 0
              ? fillText(text.callNewIn, { time: formatWait(waitLeft()) })
              : text.callNew
          }}
        </button>
      }
    </div>
  `,
})
export class CallWait {
  private readonly document = inject(DOCUMENT);
  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth.signInStep;
  protected readonly valueClass = 'whitespace-nowrap font-medium text-ink';
  protected readonly fillText = fillText;
  protected readonly formatWait = formatWait;
  private readonly closed = inject(STOREFRONT_ACCOUNTS_TEXT).auth.closed;

  /** The check to wait on. Each new value starts the wait over. */
  readonly step = input.required<CallStep>();
  readonly checkCall =
    input.required<(remember: boolean) => Promise<CallResult>>();
  readonly renewCall = input.required<() => Promise<SendResult>>();
  /** The wait a "no new check yet" refusal named, in seconds. */
  readonly retryAfter = input<() => number | null>(() => null);

  /** The call came, and the session has started. */
  readonly done = output<void>();
  /** The pending sign-in has ended, and starts over from the password. */
  readonly restart = output<void>();

  protected readonly remember = signal(false);
  protected readonly byMail = computed(() => this.step().sentTo !== undefined);

  protected readonly intro = computed(() => {
    const step = this.step();
    return step.sentTo !== undefined
      ? placeholderRuns(this.text.callByMail, {
          sentTo: step.sentTo,
          phone: step.phone,
        })
      : placeholderRuns(this.text.callIntro, {
          callTo: step.callTo,
          phone: step.phone,
        });
  });
  protected readonly confirmNote = computed(() =>
    placeholderRuns(this.text.callConfirmNote, { phone: this.step().phone }),
  );

  protected readonly busy = signal(false);
  /** The check is over: the provider said so, or its time ran out here. */
  protected readonly over = signal(false);
  /** A line that replaces the waiting one until the next answer. */
  private readonly notice = signal<{ text: string; failed: boolean } | null>(
    null,
  );

  private readonly now = tickingNow();
  private readonly expiresAt = signal(0);
  private readonly renewAt = signal(0);
  private readonly timeLeft = computed(() =>
    Math.max(0, (this.expiresAt() - this.now()) / 1000),
  );
  protected readonly waitLeft = computed(() =>
    Math.max(0, (this.renewAt() - this.now()) / 1000),
  );

  protected readonly failed = computed(() => this.notice()?.failed ?? false);
  protected readonly message = computed(() => {
    const notice = this.notice();
    if (notice) return notice.text;
    if (this.over()) return this.text.callExpired;
    return fillText(this.text.callWaiting, {
      time: formatWait(this.timeLeft()),
    });
  });

  /** Whether an answer is out; asking again meanwhile would only race it. */
  private asking = false;

  constructor() {
    effect(() => {
      const step = this.step();
      const now = Date.now();
      this.now.set(now);
      this.expiresAt.set(now + step.expiresIn * 1000);
      this.renewAt.set(now + step.resendIn * 1000);
      this.over.set(step.expiresIn <= 0);
    });

    // Browser only: a timer on the server would keep the render from settling.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const poll = setInterval(() => void this.ask(), POLL_MS);
      destroyRef.onDestroy(() => clearInterval(poll));
    });
  }

  private async ask(): Promise<void> {
    if (this.asking || this.over() || this.document.hidden) return;
    // Out of time here: ask once more, since a call in the last second may
    // only now be known, and stop after that whatever the answer.
    const last = this.timeLeft() <= 0;
    this.asking = true;
    const result = await this.checkCall()(this.remember());
    this.asking = false;

    switch (result) {
      case 'ok':
        this.done.emit();
        return;
      case 'restart':
        this.restart.emit();
        return;
      case 'waiting':
        this.notice.set(null);
        if (last) this.over.set(true);
        return;
      case 'expired':
        this.notice.set(null);
        this.over.set(true);
        return;
      case 'closed':
        this.notice.set({ text: this.closed, failed: true });
        this.over.set(true);
        return;
      // A provider that cannot tell now may tell at the next ask.
      case 'unavailable':
        this.notice.set({ text: this.text.unavailable, failed: true });
        if (last) this.over.set(true);
        return;
      default:
        this.notice.set({ text: this.text.error, failed: true });
        if (last) this.over.set(true);
    }
  }

  protected async renew(): Promise<void> {
    this.busy.set(true);
    const result = await this.renewCall()();
    this.busy.set(false);
    if (result === 'ok') {
      // The new step resets the clock; say why the number may have changed.
      this.notice.set({ text: this.text.callRenewed, failed: false });
      return;
    }
    if (result === 'restart') {
      this.restart.emit();
      return;
    }
    if (result === 'limit') {
      const retryAfter = this.retryAfter()();
      if (retryAfter !== null) {
        this.renewAt.set(Date.now() + retryAfter * 1000);
      }
    }
    this.notice.set({
      text:
        result === 'error'
          ? this.text.error
          : sendFailureLine(
              this.text,
              result,
              this.waitLeft(),
              this.text.callLimit,
            ),
      failed: true,
    });
  }
}
