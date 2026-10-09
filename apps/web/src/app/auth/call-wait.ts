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
import { CallStep } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import type { CallResult, SendResult } from './auth.service';
import { formatWait } from './code-entry';

/** How often the screen asks whether the call has come. */
const POLL_MS = 3000;

/** The line before and after each placeholder, so values can be set apart. */
function pieces(line: string, values: Record<string, string>) {
  return line
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      return key && key in values
        ? { text: values[key], value: true }
        : { text: part, value: false };
    });
}

/**
 * Waiting for a call from the account's number (FR-AUTH-12): the number to
 * call as a link a phone can dial, the time left, and one message line. The
 * screen asks every few seconds whether the call has come, and goes on by
 * itself once it has. The caller supplies what asking and a new check do.
 *
 * Asking stops while the tab is hidden, and once the check is over: a new
 * number is then asked for, like a new code.
 */
@Component({
  selector: 'app-call-wait',
  imports: [Button, Checkbox],
  host: { class: 'block' },
  template: `
    <!-- Each number is one unit: a number broken across two lines no longer
         reads as a number. Every piece is a span of its own, so no line break
         in this template turns into a space before the punctuation. -->
    <p class="text-muted">
      @for (part of intro(); track $index) {
        <span [class]="part.value ? valueClass : ''">{{ part.text }}</span>
      }
    </p>
    @if (step().confirming) {
      <p class="mt-1 text-muted">
        @for (part of confirmNote(); track $index) {
          <span [class.whitespace-nowrap]="part.value">{{ part.text }}</span>
        }
      </p>
    }

    <div class="mt-6 space-y-6">
      @if (step().rememberDays > 0) {
        <div>
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              appCheckbox
              type="checkbox"
              class="mt-0.5"
              [checked]="remember()"
              (change)="remember.set($any($event.target).checked)"
              aria-describedby="rememberBrowserHint"
            />
            <span>{{ rememberLabel() }}</span>
          </label>
          <p id="rememberBrowserHint" class="mt-1 pl-6 text-sm text-muted">
            {{ text.rememberHint }}
          </p>
        </div>
      }

      @if (!byMail() && !over()) {
        <a appButton [href]="'tel:' + step().dial" class="tabular-nums">
          {{ text.callDial.replace('{callTo}', step().callTo) }}
        </a>
      }

      <p
        class="text-sm tabular-nums"
        [class.text-red-600]="failed()"
        [class.text-muted]="!failed()"
        [attr.role]="failed() ? 'alert' : 'status'"
      >
        {{ message() }}
      </p>

      @if (over()) {
        <!-- Counted in figures of one width, so it does not jitter. -->
        <button
          appButton
          type="button"
          class="tabular-nums"
          [disabled]="busy() || waitLeft() > 0"
          [attr.aria-busy]="busy() || null"
          (click)="renew()"
        >
          {{
            waitLeft() > 0
              ? text.callNewIn.replace('{time}', wait(waitLeft()))
              : text.callNew
          }}
        </button>
      }
    </div>
  `,
})
export class CallWait {
  private readonly document = inject(DOCUMENT);
  protected readonly text = inject(APP_TEXT).auth.signInStep;
  protected readonly valueClass = 'whitespace-nowrap font-medium text-ink';
  private readonly closed = inject(APP_TEXT).auth.closed;

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
  protected readonly rememberLabel = computed(() =>
    this.text.remember.replace('{days}', String(this.step().rememberDays)),
  );
  protected readonly byMail = computed(() => this.step().sentTo !== undefined);

  protected readonly intro = computed(() => {
    const step = this.step();
    return step.sentTo !== undefined
      ? pieces(this.text.callByMail, { sentTo: step.sentTo, phone: step.phone })
      : pieces(this.text.callIntro, { callTo: step.callTo, phone: step.phone });
  });
  protected readonly confirmNote = computed(() =>
    pieces(this.text.callConfirmNote, { phone: this.step().phone }),
  );

  protected readonly busy = signal(false);
  /** The check is over: the provider said so, or its time ran out here. */
  protected readonly over = signal(false);
  /** A line that replaces the waiting one until the next answer. */
  private readonly notice = signal<{ text: string; failed: boolean } | null>(
    null,
  );

  private readonly now = signal(Date.now());
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
    return this.text.callWaiting.replace('{time}', formatWait(this.timeLeft()));
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

    // In the browser only: a timer on the server would keep the render from
    // settling, and there is nobody there to wait for.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const tick = setInterval(() => this.now.set(Date.now()), 1000);
      const poll = setInterval(() => void this.ask(), POLL_MS);
      destroyRef.onDestroy(() => {
        clearInterval(tick);
        clearInterval(poll);
      });
    });
  }

  protected wait(seconds: number): string {
    return formatWait(seconds);
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
    const lines: Partial<Record<SendResult, string>> = {
      limit: this.text.callLimit.replace('{time}', formatWait(this.waitLeft())),
      unreachable: this.text.unreachableAccount,
      unavailable: this.text.unavailable,
    };
    this.notice.set({ text: lines[result] ?? this.text.error, failed: true });
  }
}
