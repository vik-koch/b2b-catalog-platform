import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Button } from './button';
import { AutoGrow } from './auto-grow';
import { FieldLabel } from './field-label';
import { Input } from './input';
import { DialogActions } from './dialog-actions';
import { DialogPanel } from './dialog-panel';

/**
 * Generic yes/no confirmation modal, optionally asking why.
 *
 * The reason field is here rather than in a second dialog because the question
 * is the same one: a destructive answer that somebody has to be told about —
 * an order declined, an order called off — is a confirmation with a sentence
 * attached, and a caller that needs one should not have to build a modal.
 *
 * Rendered by `ConfirmService` rather than used in templates directly.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [AutoGrow, Button, DialogActions, DialogPanel, FieldLabel, Input],
  template: `
    <dialog
      #dialog
      (cancel)="cancelled.emit()"
      aria-labelledby="confirm-dialog-heading"
      appDialogPanel
    >
      <h2
        id="confirm-dialog-heading"
        class="text-xl font-normal tracking-tight"
      >
        {{ heading() }}
      </h2>
      <p class="mt-3 text-muted">{{ message() }}</p>

      @if (reasonLabel(); as label) {
        <div class="mt-5">
          <label appFieldLabel for="confirm-dialog-reason">{{ label }}</label>
          <textarea
            appInput
            appAutoGrow
            id="confirm-dialog-reason"
            class="w-full"
            rows="2"
            [attr.maxlength]="reasonMaxLength()"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          ></textarea>
        </div>
      }

      <div appDialogActions>
        <button
          appButton
          variant="secondary"
          type="button"
          (click)="cancelled.emit()"
        >
          {{ cancelLabel() }}
        </button>
        <button
          appButton
          [variant]="confirmVariant()"
          type="button"
          [disabled]="incomplete()"
          (click)="confirmed.emit(reason().trim())"
        >
          {{ confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
})
export class ConfirmDialog {
  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly confirmVariant = input<'primary' | 'danger'>('danger');
  /** Present where the answer may say why; absent for a plain yes/no. */
  readonly reasonLabel = input<string | null>(null);
  readonly reasonMaxLength = input<number>(500);
  /** Whether the answer is refused without one. A reason quoted *at* somebody
   * has to exist; one quoted at the shop is a courtesy. */
  readonly reasonRequired = input(true);

  /** The reason as typed, or an empty string where none was asked for. */
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly reason = signal('');
  protected readonly incomplete = computed(
    () =>
      this.reasonLabel() !== null &&
      this.reasonRequired() &&
      this.reason().trim() === '',
  );

  constructor() {
    // showModal() must be called imperatively for the focus trap and backdrop;
    // the host destroys this component to close, and a removed dialog is closed.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
}
