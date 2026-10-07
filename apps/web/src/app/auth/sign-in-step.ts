import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SIGN_IN_CODE_LENGTH } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { canonicalPhone, phoneValidators } from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { Button } from '../ui/button';
import { CodeInput } from '../ui/code-input';
import { FieldLabel } from '../ui/field-label';
import { TextButton } from '../ui/link';
import { PhoneField } from '../ui/phone-field';
import { AuthService, CodeResult, SendResult } from './auth.service';

/** A wait as minutes and seconds: `0:42`, `27:05`. */
export function formatWait(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The code after the password (FR-AUTH-12), wherever a password leads to a
 * session: the sign-in form and the set-password page show this in place of
 * their own form once the API says a code is owed.
 *
 * Two screens. The code, sent where the screen says; and, while a number is
 * being confirmed, a number to send it to instead. A confirmed number cannot
 * be swapped here: it is the factor itself.
 *
 * A message stays until the next answer replaces it, so pressing a button
 * never makes the form jump while the request is out.
 */
@Component({
  selector: 'app-sign-in-step',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    Button,
    CodeInput,
    FieldLabel,
    PhoneField,
    TextButton,
  ],
  template: `
    @if (restart()) {
      <h1 class="mb-4 text-3xl font-medium tracking-tight">
        {{ text.codeHeading }}
      </h1>
      <p class="text-muted" role="alert">{{ text.restart }}</p>
      <a appButton routerLink="/login" class="mt-8">{{ text.restartAction }}</a>
    } @else if (showPhone()) {
      <h1 class="mb-2 text-3xl font-medium tracking-tight">
        {{ text.phoneHeading }}
      </h1>
      <p class="mb-6 text-muted">{{ text.phoneIntro }}</p>

      <form
        [formGroup]="phoneForm"
        (ngSubmit)="sendToNumber()"
        novalidate
        class="space-y-6"
      >
        <app-phone-field
          [control]="phoneForm.controls.phone"
          [label]="text.phone"
          [text]="phoneText"
          [invalid]="phoneErrors.show(phoneForm.controls.phone)"
        />

        <ng-container *ngTemplateOutlet="messageLine" />

        <div class="flex flex-wrap items-center justify-between gap-4">
          <!-- One label throughout: a swap shown for the length of a request
               changes the button's width and moves what is beside it. -->
          <button
            appButton
            type="submit"
            [disabled]="busy()"
            [attr.aria-busy]="busy() || null"
          >
            {{ text.phoneSubmit }}
          </button>
          @if (codeStep()) {
            <button
              type="button"
              appTextButton
              class="text-sm"
              (click)="backToCode()"
            >
              {{ text.backToCode }}
            </button>
          }
        </div>
      </form>
    } @else if (codeStep(); as step) {
      <h1 class="mb-2 text-3xl font-medium tracking-tight">
        {{ text.codeHeading }}
      </h1>
      <!-- Each masked value is one unit: a number broken across two lines no
           longer reads as a number. -->
      @let intro = around(fill(text.codeIntro), '{sentTo}');
      <p class="text-muted">
        {{ intro[0] }}<span class="whitespace-nowrap">{{ step.sentTo }}</span
        >{{ intro[1] }}
      </p>
      @if (step.canChangeNumber) {
        @let note = around(text.confirmNote, '{phone}');
        <p class="mt-1 text-muted">
          {{ note[0] }}<span class="whitespace-nowrap">{{ step.phone }}</span
          >{{ note[1] }}
        </p>
      }

      <form
        [formGroup]="codeForm"
        (ngSubmit)="submitCode()"
        novalidate
        class="mt-6 space-y-6"
      >
        <div>
          <label for="signInCode" appFieldLabel>{{ text.code }}</label>
          <app-code-input
            inputId="signInCode"
            [control]="codeForm.controls.code"
            [length]="length"
            [invalid]="codeErrors.show(codeForm.controls.code)"
            describedBy="signInCode-message"
            (completed)="submitCode()"
          />
          @if (codeErrors.show(codeForm.controls.code)) {
            <p class="mt-1 text-sm text-red-600">
              {{
                codeForm.controls.code.hasError('required')
                  ? text.codeRequired
                  : fill(text.codeFormat)
              }}
            </p>
          }
        </div>

        <ng-container *ngTemplateOutlet="messageLine" />

        <!-- Continue on the left, the two ways round it on the right: a label
             that changes width there (the countdown) moves nothing else. -->
        <div
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <button
            appButton
            type="submit"
            [disabled]="busy()"
            [attr.aria-busy]="busy() || null"
          >
            {{ text.submit }}
          </button>
          <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            <!-- The wait is counted on the control itself, in figures of one
                 width, so the label does not jitter as it counts. -->
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
            @if (step.canChangeNumber) {
              <button
                type="button"
                appTextButton
                class="text-sm"
                (click)="editNumber()"
              >
                {{ text.changeNumber }}
              </button>
            }
          </div>
        </div>
      </form>
    }

    <ng-template #messageLine>
      <p
        id="signInCode-message"
        class="text-sm"
        [class.text-red-600]="!notice()"
        [class.text-muted]="notice()"
        [attr.role]="notice() ? 'status' : 'alert'"
        [hidden]="!message()"
      >
        {{ message() }}
      </p>
    </ng-template>
  `,
})
export class SignInStepPanel {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;

  protected readonly text = inject(APP_TEXT).auth.signInStep;
  private readonly closed = inject(APP_TEXT).auth.closed;
  private readonly validation = inject(APP_TEXT).auth.register.validation;
  protected readonly phoneText = {
    required: this.validation.phoneRequired,
    incomplete: this.validation.phoneIncomplete,
  };
  protected readonly length = SIGN_IN_CODE_LENGTH;

  /** The session has started. */
  readonly done = output<void>();

  private readonly codeInput = viewChild(CodeInput);

  protected readonly busy = signal(false);
  protected readonly restart = signal(false);
  /** One line under the form; a notice (a code was resent) is not an error. */
  protected readonly message = signal<string | null>(null);
  protected readonly notice = signal(false);
  private readonly editing = signal(false);

  protected readonly codeStep = computed(() => {
    const step = this.auth.step();
    return step?.step === 'code' ? step : null;
  });
  protected readonly showPhone = computed(
    () => this.auth.step()?.step === 'phone' || this.editing(),
  );

  /** When another code may be asked for, by this browser's clock. */
  private readonly resendAt = signal(0);
  private readonly now = signal(Date.now());
  protected readonly waitLeft = computed(() =>
    Math.max(0, (this.resendAt() - this.now()) / 1000),
  );

  protected readonly codeForm = this.fb.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.pattern(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`)),
      ],
    ],
  });
  protected readonly codeErrors = new FieldErrors(this.codeForm);

  protected readonly phoneForm = this.fb.nonNullable.group({
    phone: ['', phoneValidators(this.phoneInput, true)],
  });
  protected readonly phoneErrors = new FieldErrors(this.phoneForm);

  constructor() {
    // Every answer about a code carries the wait from then, and the countdown
    // starts over from each one.
    effect(() => {
      const step = this.codeStep();
      if (step) this.waitFor(step.resendIn);
    });

    // A second's tick, in the browser only: the step is never drawn on the
    // server, and an interval there would keep the render from settling.
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

  /** The line before and after a placeholder, so its value can be set apart. */
  protected around(line: string, placeholder: string): [string, string] {
    const [before, ...after] = line.split(placeholder);
    return [before, after.join('')];
  }

  protected wait(seconds: number): string {
    return formatWait(seconds);
  }

  protected editNumber(): void {
    this.message.set(null);
    this.editing.set(true);
  }

  protected backToCode(): void {
    this.message.set(null);
    this.editing.set(false);
  }

  protected async submitCode(): Promise<void> {
    if (this.busy()) return;
    this.codeErrors.markSubmitted();
    if (this.codeForm.invalid) return;

    this.busy.set(true);
    const outcome = await this.auth.submitCode(
      this.codeForm.controls.code.value.trim(),
    );
    this.busy.set(false);
    if (outcome.result === 'ok') {
      this.done.emit();
      return;
    }
    // A refused code is no use to keep: the next attempt starts empty.
    this.clearCode();
    this.show(outcome);
  }

  protected async resend(): Promise<void> {
    this.busy.set(true);
    const result = await this.auth.resendCode();
    this.busy.set(false);
    if (result === 'ok') this.clearCode();
    this.show(result, this.text.resent);
  }

  protected async sendToNumber(): Promise<void> {
    this.phoneErrors.markSubmitted();
    if (this.phoneForm.invalid) return;

    this.busy.set(true);
    const result = await this.auth.useNumber(
      canonicalPhone(this.phoneForm.controls.phone.value, this.phoneInput),
    );
    this.busy.set(false);
    if (result === 'ok') {
      this.editing.set(false);
      this.message.set(null);
      this.clearCode();
      return;
    }
    this.show(result);
  }

  private clearCode(): void {
    this.codeForm.reset();
    this.codeErrors.reset();
    this.codeInput()?.focus();
  }

  private waitFor(seconds: number): void {
    const now = Date.now();
    this.now.set(now);
    this.resendAt.set(now + seconds * 1000);
  }

  private show(outcome: CodeResult | SendResult, ok?: string): void {
    let result = typeof outcome === 'string' ? outcome : outcome.result;
    // The last wrong entry spends the code, and says so.
    if (typeof outcome === 'object' && 'attemptsLeft' in outcome) {
      if (outcome.attemptsLeft === 0) result = 'expired';
    }
    if (result === 'restart') {
      this.restart.set(true);
      return;
    }
    if (result === 'limit') {
      const retryAfter = this.auth.retryAfter();
      if (retryAfter !== null) this.waitFor(retryAfter);
    }
    const attemptsLeft =
      typeof outcome === 'object' && 'attemptsLeft' in outcome
        ? outcome.attemptsLeft
        : 0;
    const lines: Partial<Record<string, string>> = {
      ok,
      wrong: this.text.wrong.replace('{count}', String(attemptsLeft)),
      expired: this.text.expired,
      limit: this.text.limit.replace('{time}', formatWait(this.waitLeft())),
      unreachable: this.text.unreachable,
      unavailable: this.text.unavailable,
      'phone-format': this.validation.phoneIncomplete,
      closed: this.closed,
    };
    this.notice.set(result === 'ok');
    this.message.set(lines[result] ?? this.text.error);
  }
}
