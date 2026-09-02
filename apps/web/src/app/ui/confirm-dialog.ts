import {
  afterNextRender,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Button } from './button';
import { DialogActions } from './dialog-actions';
import { DialogPanel } from './dialog-panel';

/**
 * Generic yes/no confirmation modal.
 * Rendered by `ConfirmService` rather than used in templates directly.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Button, DialogActions, DialogPanel],
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
          (click)="confirmed.emit()"
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

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  constructor() {
    // showModal() must be called imperatively for the focus trap and backdrop;
    // the host destroys this component to close, and a removed dialog is closed.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
}
