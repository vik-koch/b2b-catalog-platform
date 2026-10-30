import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Button } from '../actions/button';
import { Checkbox } from '../choices/checkbox';
import { TickLabel } from '../choices/tick-label';
import { AutoGrow } from '../inputs/auto-grow';
import { FieldLabel } from '../fields/field-label';
import { Input } from '../inputs/input';
import { DialogActions } from './dialog-actions';
import { DialogPanel } from './dialog-panel';
import { WarningNote } from '../content/warning-note';
import { Hint } from '../fields/hint';
import { DialogTitle } from './dialog-title';

/** One thing that happens because the answer was yes, offered as a tick. */
export interface ConfirmCheck {
  key: string;
  label: string;
  /** The line under it, where the tick needs a word of explanation. */
  hint?: string;
  /** How it is offered: the usual answer, which the person may override. */
  checked: boolean;
  /**
   * The key of a tick this one only makes sense with. Offered under it,
   * disabled while it is clear and cleared with it: a tick that is on but
   * cannot take effect is a promise the dialog does not keep.
   */
  requires?: string;
}

/** The reason as typed, and how every choice was left. */
export interface ConfirmAnswer {
  reason: string;
  checks: Record<string, boolean>;
}

/**
 * A yes/no modal, optionally asking why: an answer somebody has to be told
 * about is a confirmation with a sentence attached. Rendered by
 * ConfirmService, not used in templates.
 */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [
    DialogTitle,
    AutoGrow,
    Button,
    Checkbox,
    TickLabel,
    DialogActions,
    DialogPanel,
    FieldLabel,
    Input,
    WarningNote,
    Hint,
  ],
  template: `
    <dialog
      #dialog
      (cancel)="cancelled.emit()"
      aria-labelledby="confirm-dialog-heading"
      uiDialogPanel
    >
      <h2 id="confirm-dialog-heading" uiDialogTitle>
        {{ heading() }}
      </h2>
      <p class="mt-3 text-ink-subtle">{{ message() }}</p>

      <!-- Amber, never red: it refuses nothing. -->
      @if (warning(); as note) {
        <ui-warning-note class="mt-3">{{ note }}</ui-warning-note>
      }

      @if (reasonLabel(); as label) {
        <div class="mt-5">
          <!-- The confirm button waits on it, so it wears the required mark. -->
          <label uiFieldLabel for="confirm-dialog-reason">
            {{ label }}
            @if (reasonRequired()) {
              <span class="text-accent" aria-hidden="true">*</span>
            }
          </label>
          <textarea
            uiInput
            uiAutoGrow
            id="confirm-dialog-reason"
            class="w-full"
            rows="2"
            [attr.maxlength]="reasonMaxLength()"
            [attr.required]="reasonRequired() ? '' : null"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          ></textarea>
        </div>
      }

      @for (check of checks(); track check.key) {
        <label
          uiTickLabel
          class="mt-4"
          [class.ml-6]="check.requires"
          [class.opacity-50]="blocked(check)"
        >
          <input
            uiCheckbox
            type="checkbox"
            [checked]="ticked()[check.key]"
            [disabled]="blocked(check)"
            (change)="tick(check.key, $any($event.target).checked)"
          />
          <span>
            {{ check.label }}
            @if (check.hint) {
              <span uiHint>{{ check.hint }}</span>
            }
          </span>
        </label>
      }

      <div uiDialogActions>
        <button
          uiButton
          variant="secondary"
          type="button"
          (click)="cancelled.emit()"
        >
          {{ cancelLabel() }}
        </button>
        <!-- Absent where the dialog only explains. -->
        @if (confirmLabel(); as label) {
          <button
            uiButton
            [variant]="confirmVariant()"
            type="button"
            [disabled]="incomplete()"
            (click)="
              confirmed.emit({ reason: reason().trim(), checks: ticked() })
            "
          >
            {{ label }}
          </button>
        }
      </div>
    </dialog>
  `,
})
export class ConfirmDialog {
  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  /** A consequence to weigh, drawn under the question. */
  readonly warning = input<string | null>(null);
  /** Null where the dialog only explains, leaving the close button. */
  readonly confirmLabel = input.required<string | null>();
  readonly cancelLabel = input.required<string>();
  readonly confirmVariant = input<'primary' | 'danger'>('danger');
  /** Present where the answer may say why; absent for a plain yes/no. */
  readonly reasonLabel = input<string | null>(null);
  /**
   * What happens because of the answer, decided in the same breath as it
   * rather than in a second dialog.
   */
  readonly checks = input<readonly ConfirmCheck[]>([]);
  readonly reasonMaxLength = input<number>(500);
  /** Whether the answer is refused without a reason. */
  readonly reasonRequired = input(true);

  /** The reason (empty where none was asked for) and how every choice was left. */
  readonly confirmed = output<ConfirmAnswer>();
  readonly cancelled = output<void>();

  protected readonly reason = signal('');
  /**
   * Each choice as it stands, seeded from how it was offered. A linkedSignal:
   * inputs are set after construction, so the constructor sees defaults.
   */
  protected readonly ticked = linkedSignal<Record<string, boolean>>(() =>
    Object.fromEntries(
      this.checks().map((check) => [check.key, check.checked]),
    ),
  );
  protected readonly incomplete = computed(
    () =>
      this.reasonLabel() !== null &&
      this.reasonRequired() &&
      this.reason().trim() === '',
  );

  /** Whether a tick is unavailable because the one it hangs off is clear. */
  protected blocked(check: ConfirmCheck): boolean {
    return check.requires !== undefined && !this.ticked()[check.requires];
  }

  /** Clearing a tick clears whatever hangs off it, so the answer is what was shown. */
  protected tick(key: string, on: boolean): void {
    this.ticked.update((state) => {
      const next = { ...state, [key]: on };
      if (on) return next;
      for (const check of this.checks()) {
        if (check.requires === key) next[check.key] = false;
      }
      return next;
    });
  }

  constructor() {
    // showModal() must be called imperatively for the focus trap and backdrop;
    // the host destroys this component to close, and a removed dialog is closed.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
}
