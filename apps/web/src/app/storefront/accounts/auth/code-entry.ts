import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { form, maxLength, pattern, required } from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { CodeInput } from '@b2b-catalog-platform/ui/inputs/code-input';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { SubmitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import type { CodeResult, SendResult } from './sign-in.service';
import { formatWait, tickingNow } from './countdown';
import { placeholderRuns } from './placeholder-runs';
import { RememberBrowser } from './ui/remember-browser';
import { sendFailureLine } from './send-failure-line';
import {
  CodeSent,
  SIGN_IN_CODE_LENGTH,
} from '@b2b-catalog-platform/shared/core/accounts';
import { untilInteractive } from '../../../platform/field-rules';

/**
 * Entering a code sent to a phone; the caller supplies what a code and a
 * resend do. A message stays until the next answer replaces it, so the form
 * never jumps while a request is out.
 */
@Component({
  selector: 'app-code-entry',
  imports: [FORM_FIELDS, Button, CodeInput, RememberBrowser, TextButton],
  host: { class: 'block' },
  template: `
    <p class="text-ink-subtle">
      @for (run of introRuns(); track $index) {
        <span [class.whitespace-nowrap]="run.value">{{ run.text }}</span>
      }
    </p>
    @if (noteRuns(); as runs) {
      <p class="mt-1 text-ink-subtle">
        @for (run of runs; track $index) {
          <span [class.whitespace-nowrap]="run.value">{{ run.text }}</span>
        }
      </p>
    }

    <form #formElement [formRoot]="form" class="mt-6 space-y-6">
      <!-- Above the boxes, not below: six digits submit by themselves, so a
           box after them would be passed before anyone reached it. -->
      @if (rememberDays() > 0) {
        <app-remember-browser
          [days]="rememberDays()"
          [formField]="form.remember"
        />
      }

      <ui-field
        [field]="form.code"
        [label]="text.code"
        [marker]="false"
        [controlId]="inputId"
        [describedBy]="inputId + '-message'"
      >
        <!-- Six digits send themselves, the way pressing Enter would. -->
        <ui-code-input
          [field]="form.code"
          (completed)="formElement.requestSubmit()"
        />
      </ui-field>

      <p
        [id]="inputId + '-message'"
        class="text-sm"
        [class.text-danger]="!notice()"
        [class.text-ink-subtle]="notice()"
        [attr.role]="notice() ? 'status' : 'alert'"
        [hidden]="!message()"
      >
        {{ message() }}
      </p>

      <!-- The resend control on the right, so its counting label moves
           nothing; Continue keeps one label, so its width never changes. -->
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          uiButton
          type="submit"
          [disabled]="busy()"
          [attr.aria-busy]="busy() || null"
        >
          {{ text.submit }}
        </button>
        <!-- Counted in figures of one width, so it does not jitter. -->
        <button
          type="button"
          uiTextButton
          class="text-sm tabular-nums"
          [disabled]="busy() || waitLeft() > 0"
          (click)="resend()"
        >
          {{
            waitLeft() > 0
              ? fillText(text.resendIn, { time: formatWait(waitLeft()) })
              : text.resend
          }}
        </button>
      </div>
    </form>
  `,
})
export class CodeEntry {
  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth.signInStep;
  private readonly closed = inject(STOREFRONT_ACCOUNTS_TEXT).auth.closed;
  protected readonly inputId = 'signInCode';
  protected readonly fillText = fillText;
  protected readonly formatWait = formatWait;

  /** Each new value starts the countdown over. */
  readonly sent = input.required<CodeSent>();
  /** The line above the boxes; `{sentTo}` and `{length}` are filled in. */
  readonly intro = input.required<string>();
  /** A second line naming the number, `{phone}`, where it says something. */
  readonly note = input<string | null>(null);
  readonly submitCode =
    input.required<(code: string, remember: boolean) => Promise<CodeResult>>();
  /** Above 0, a box offers to remember this browser for that many days. */
  readonly rememberDays = input(0);
  readonly resendCode = input.required<() => Promise<SendResult>>();
  /** The wait a "no new code yet" refusal named, in seconds. */
  readonly retryAfter = input<() => number | null>(() => null);

  /** The code was right. */
  readonly done = output<void>();
  /** What the code was for has ended, and starts over elsewhere. */
  readonly restart = output<void>();

  private readonly codeInput = viewChild(CodeInput);
  private readonly attempt = viewChild(SubmitAttempt);

  protected readonly busy = signal(false);
  /** One line under the boxes; a notice (a code was resent) is not an error. */
  protected readonly message = signal<string | null>(null);
  protected readonly notice = signal(false);

  /** By this browser's clock. */
  private readonly resendAt = signal(0);
  private readonly now = tickingNow();
  protected readonly waitLeft = computed(() =>
    Math.max(0, (this.resendAt() - this.now()) / 1000),
  );

  private readonly model = signal({ code: '', remember: false });
  protected readonly form = form(
    this.model,
    (entry) => {
      untilInteractive(entry);
      required(entry.code, { message: this.text.codeRequired });
      maxLength(entry.code, SIGN_IN_CODE_LENGTH);
      pattern(entry.code, new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`), {
        message: this.withLength(this.text.codeFormat),
      });
    },
    { name: 'sign-in-code', submission: { action: () => this.send() } },
  );

  constructor() {
    effect(() => this.waitFor(this.sent().resendIn));
    afterNextRender(() => this.codeInput()?.focus());
  }

  protected readonly introRuns = computed(() =>
    placeholderRuns(this.withLength(this.intro()), {
      sentTo: this.sent().sentTo,
    }),
  );
  protected readonly noteRuns = computed(() => {
    const note = this.note();
    return note
      ? placeholderRuns(this.withLength(note), { phone: this.sent().phone })
      : null;
  });

  private withLength(line: string): string {
    return fillText(line, { length: SIGN_IN_CODE_LENGTH });
  }

  private async send(): Promise<void> {
    if (this.busy()) return;

    this.busy.set(true);
    const { code, remember } = this.model();
    const outcome = await this.submitCode()(
      code.trim(),
      this.rememberDays() > 0 && remember,
    );
    this.busy.set(false);
    if (outcome.result === 'ok') {
      this.done.emit();
      return;
    }
    // A refused code is no use to keep: the next attempt starts empty.
    this.clear();
    this.show(outcome);
  }

  protected async resend(): Promise<void> {
    this.busy.set(true);
    const result = await this.resendCode()();
    this.busy.set(false);
    if (result === 'ok') this.clear();
    this.show(result, this.text.resent);
  }

  private clear(): void {
    // The code only: a ticked box stays ticked for the next try.
    this.form.code().reset('');
    this.attempt()?.reset();
    this.codeInput()?.focus();
  }

  private waitFor(seconds: number): void {
    const now = Date.now();
    this.now.set(now);
    this.resendAt.set(now + seconds * 1000);
  }

  private show(outcome: CodeResult | SendResult, ok?: string): void {
    let result = typeof outcome === 'string' ? outcome : outcome.result;
    const attemptsLeft =
      typeof outcome === 'object' && 'attemptsLeft' in outcome
        ? outcome.attemptsLeft
        : null;
    // The last wrong entry spends the code, and says so.
    if (attemptsLeft === 0) result = 'expired';
    if (result === 'restart') {
      this.restart.emit();
      return;
    }
    if (result === 'limit') {
      const retryAfter = this.retryAfter()();
      if (retryAfter !== null) this.waitFor(retryAfter);
    }
    const lines: Partial<Record<string, string>> = {
      ok,
      wrong: fillText(this.text.wrong, { count: attemptsLeft ?? 0 }),
      expired: this.text.expired,
      closed: this.closed,
    };
    this.notice.set(result === 'ok');
    this.message.set(
      result === 'unreachable' || result === 'unavailable' || result === 'limit'
        ? sendFailureLine(this.text, result, this.waitLeft())
        : (lines[result] ?? this.text.error),
    );
  }
}
