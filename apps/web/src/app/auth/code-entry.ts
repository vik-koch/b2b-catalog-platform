import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CodeSent, SIGN_IN_CODE_LENGTH } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldErrors } from '../core/form-errors';
import { Button } from '../ui/button';
import { CodeInput } from '../ui/code-input';
import { FieldLabel } from '../ui/field-label';
import { TextButton } from '../ui/link';
import type { CodeResult, SendResult } from './auth.service';

/** A wait as minutes and seconds: `0:42`, `27:05`. */
export function formatWait(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/** The line before and after a placeholder, so its value can be set apart. */
function around(line: string, placeholder: string): [string, string] {
  const [before, ...after] = line.split(placeholder);
  return [before, after.join('')];
}

/**
 * Entering a code sent to a phone (FR-AUTH-12): where it went, the boxes, a
 * countdown to the next code, and one message line. The caller supplies what
 * a code and a resend do.
 *
 * A message stays until the next answer replaces it, so pressing a button
 * never makes the form jump while the request is out.
 */
@Component({
  selector: 'app-code-entry',
  imports: [ReactiveFormsModule, Button, CodeInput, FieldLabel, TextButton],
  host: { class: 'block' },
  template: `
    <!-- Each masked value is one unit: a number broken across two lines no
         longer reads as a number. -->
    @let lead = around(fill(intro()), '{sentTo}');
    <p class="text-muted">
      {{ lead[0] }}<span class="whitespace-nowrap">{{ sent().sentTo }}</span
      >{{ lead[1] }}
    </p>
    @if (note(); as line) {
      @let tail = around(fill(line), '{phone}');
      <p class="mt-1 text-muted">
        {{ tail[0] }}<span class="whitespace-nowrap">{{ sent().phone }}</span
        >{{ tail[1] }}
      </p>
    }

    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      novalidate
      class="mt-6 space-y-6"
    >
      <div>
        <label [for]="inputId" appFieldLabel>{{ text.code }}</label>
        <app-code-input
          [inputId]="inputId"
          [control]="form.controls.code"
          [length]="length"
          [invalid]="errors.show(form.controls.code)"
          [describedBy]="inputId + '-message'"
          (completed)="submit()"
        />
        @if (errors.show(form.controls.code)) {
          <p class="mt-1 text-sm text-red-600">
            {{
              form.controls.code.hasError('required')
                ? text.codeRequired
                : fill(text.codeFormat)
            }}
          </p>
        }
      </div>

      <p
        [id]="inputId + '-message'"
        class="text-sm"
        [class.text-red-600]="!notice()"
        [class.text-muted]="notice()"
        [attr.role]="notice() ? 'status' : 'alert'"
        [hidden]="!message()"
      >
        {{ message() }}
      </p>

      <!-- Continue on the left, the resend control on the right: its label
           changes width as it counts and moves nothing else. One label on
           Continue throughout: a swap shown for the length of a request would
           change the button's width. -->
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          appButton
          type="submit"
          [disabled]="busy()"
          [attr.aria-busy]="busy() || null"
        >
          {{ text.submit }}
        </button>
        <!-- Counted in figures of one width, so it does not jitter. -->
        <button
          type="button"
          appTextButton
          class="text-sm tabular-nums"
          [disabled]="busy() || waitLeft() > 0"
          (click)="resend()"
        >
          {{
            waitLeft() > 0
              ? text.resendIn.replace('{time}', wait(waitLeft()))
              : text.resend
          }}
        </button>
      </div>
    </form>
  `,
})
export class CodeEntry {
  private readonly fb = inject(FormBuilder);

  protected readonly text = inject(APP_TEXT).auth.signInStep;
  private readonly closed = inject(APP_TEXT).auth.closed;
  protected readonly length = SIGN_IN_CODE_LENGTH;
  protected readonly inputId = 'signInCode';

  /** Where the code went and when another may be asked. Each new value
   * starts the countdown over. */
  readonly sent = input.required<CodeSent>();
  /** The line above the boxes; `{sentTo}` and `{length}` are filled in. */
  readonly intro = input.required<string>();
  /** A second line naming the number, `{phone}`, where it says something. */
  readonly note = input<string | null>(null);
  readonly submitCode = input.required<(code: string) => Promise<CodeResult>>();
  readonly resendCode = input.required<() => Promise<SendResult>>();
  /** The wait a "no new code yet" refusal named, in seconds. */
  readonly retryAfter = input<() => number | null>(() => null);

  /** The code was right. */
  readonly done = output<void>();
  /** Whatever the code was for has ended, and starts over elsewhere. */
  readonly restart = output<void>();

  private readonly codeInput = viewChild(CodeInput);

  protected readonly busy = signal(false);
  /** One line under the boxes; a notice (a code was resent) is not an error. */
  protected readonly message = signal<string | null>(null);
  protected readonly notice = signal(false);

  /** When another code may be asked for, by this browser's clock. */
  private readonly resendAt = signal(0);
  private readonly now = signal(Date.now());
  protected readonly waitLeft = computed(() =>
    Math.max(0, (this.resendAt() - this.now()) / 1000),
  );

  protected readonly form = this.fb.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.pattern(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`)),
      ],
    ],
  });
  protected readonly errors = new FieldErrors(this.form);

  constructor() {
    effect(() => this.waitFor(this.sent().resendIn));

    // A second's tick, in the browser only: an interval on the server would
    // keep the render from settling.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const tick = setInterval(() => this.now.set(Date.now()), 1000);
      destroyRef.onDestroy(() => clearInterval(tick));
      this.codeInput()?.focus();
    });
  }

  protected fill(line: string): string {
    return line.replaceAll('{length}', String(SIGN_IN_CODE_LENGTH));
  }

  protected around = around;

  protected wait(seconds: number): string {
    return formatWait(seconds);
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.errors.markSubmitted();
    if (this.form.invalid) return;

    this.busy.set(true);
    const outcome = await this.submitCode()(
      this.form.controls.code.value.trim(),
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
    this.form.reset();
    this.errors.reset();
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
      wrong: this.text.wrong.replace('{count}', String(attemptsLeft ?? 0)),
      expired: this.text.expired,
      limit: this.text.limit.replace('{time}', formatWait(this.waitLeft())),
      unreachable: this.text.unreachableAccount,
      unavailable: this.text.unavailable,
      closed: this.closed,
    };
    this.notice.set(result === 'ok');
    this.message.set(lines[result] ?? this.text.error);
  }
}
