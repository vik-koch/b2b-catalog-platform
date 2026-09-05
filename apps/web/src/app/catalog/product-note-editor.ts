import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CART_NOTE_MAX } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { injectNarrowScreen } from '../core/narrow-screen';
import { AutoGrow } from '../ui/auto-grow';
import { Button } from '../ui/button';
import { DialogActions } from '../ui/dialog-actions';
import { DialogPanel } from '../ui/dialog-panel';
import { FieldLabel } from '../ui/field-label';
import { Icon } from '../ui/icons/icon';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { Popover } from '../ui/popover';

/**
 * The line note's button and its field (FR-CART-08) — a bubble on a pointer, a
 * modal on a phone.
 *
 * It holds no note of its own. The buying block owns the text and decides when
 * this is open, because the note's bubble is one of several competing for the
 * one place a bubble may be, and only the block knows which of them won.
 */
@Component({
  selector: 'app-product-note-editor',
  imports: [
    AutoGrow,
    Button,
    DialogActions,
    DialogPanel,
    FieldLabel,
    Icon,
    IconButton,
    Input,
    NgTemplateOutlet,
    Popover,
  ],
  host: { class: 'relative flex' },
  template: `
    <!-- The product's question is the field's placeholder, not a line under
         it: it is what to write, and it is read while the field is empty —
         which is the only time it has anything to say. -->
    <ng-template #field>
      <label class="block text-left">
        <span appFieldLabel>{{ text.noteLabel }}</span>
        <textarea
          appInput
          appAutoGrow
          rows="3"
          class="w-full"
          [attr.maxlength]="noteMax"
          [attr.placeholder]="prompt()"
          [value]="value()"
          (input)="onInput($event)"
          (blur)="save.emit()"
        ></textarea>
      </label>
    </ng-template>

    <!-- Marked whether or not anything is written, like the pairing marker it
         stands beside: the two are one group of controls the line offers, and
         one of them greyed read as unavailable rather than unused. Which of
         them it is is the glyph's job, not the colour's. -->
    <button
      type="button"
      appIconButton
      variant="marked"
      [attr.aria-label]="written() ? text.noteEdit : text.noteAdd"
      [title]="written() ? text.noteEdit : text.noteAdd"
      (click)="requestOpen.emit()"
    >
      <!-- The glyph says whether anything is written. -->
      <app-icon
        [name]="written() ? 'message-circle-check' : 'message-circle-plus'"
      />
    </button>

    @if (open()) {
      <!-- A bubble is a thing beside the control it belongs to, and on a phone
           there is nothing beside anything: a field to type a sentence in, with
           the keyboard up, is the width of the screen. So on a phone the same
           field is a modal, which is also what gives it a way out that is not
           "tap the page behind the keyboard". -->
      @if (narrow()) {
        <dialog
          #dialog
          appDialogPanel
          [attr.aria-label]="text.noteLabel"
          (cancel)="cancelled.emit()"
        >
          <ng-container [ngTemplateOutlet]="field" />
          <!-- Two answers, because a modal took the choice the bubble made by
               being dismissed: away from it kept nothing, and there is no away
               here. -->
          <div appDialogActions>
            <button
              appButton
              variant="secondary"
              type="button"
              (click)="cancelled.emit()"
            >
              {{ text.cancel }}
            </button>
            <button appButton type="button" (click)="done.emit()">
              {{ text.noteDone }}
            </button>
          </div>
        </dialog>
      } @else {
        <!-- Upwards: everything else on this block is below the price line, and
             a bubble over the stepper and the button is one the customer has to
             clear before buying. -->
        <app-popover
          align="end"
          placement="above"
          [roomy]="true"
          (dismissed)="dismissed.emit()"
        >
          <ng-container [ngTemplateOutlet]="field" />
        </app-popover>
      }
    }
  `,
})
export class ProductNoteEditor {
  protected readonly text = inject(APP_TEXT).cart;
  protected readonly noteMax = CART_NOTE_MAX;

  /** The note as it stands. This is a view of it, never the copy of record. */
  readonly value = input.required<string>();
  /** The product's own wording for the question. */
  readonly prompt = input.required<string>();
  readonly open = input(false);

  /** The button was pressed; whether that opens the field is the block's call. */
  readonly requestOpen = output<void>();
  readonly valueChange = output<string>();
  /** The field was left — where a note is recorded. */
  readonly save = output<void>();
  /** The modal's two answers. A bubble has neither: clicking away from it is
   * the whole of its way out, and `dismissed` is that. */
  readonly done = output<void>();
  readonly cancelled = output<void>();
  readonly dismissed = output<void>();

  protected readonly written = () => this.value().trim() !== '';

  /** Below `sm` the note is a modal rather than a bubble. Safe on an SSR page
   * because nothing here depends on it until the customer opens the note,
   * which cannot happen before the browser has answered. */
  protected readonly narrow = injectNarrowScreen('sm');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // `showModal()` has to be called imperatively for the focus trap, the
    // backdrop and the top layer; the `@if` in the template is what closes the
    // note again, a removed <dialog> being a closed one.
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  protected onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLTextAreaElement).value);
  }
}
