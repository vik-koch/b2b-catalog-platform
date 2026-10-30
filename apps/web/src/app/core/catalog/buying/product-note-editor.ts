import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { CART_NOTE_MAX } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { injectNarrowScreen } from '@b2b-catalog-platform/ui/core/narrow-screen';
import { AutoGrow } from '@b2b-catalog-platform/ui/inputs/auto-grow';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { DialogActions } from '@b2b-catalog-platform/ui/overlay/dialog-actions';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Popover } from '@b2b-catalog-platform/ui/overlay/popover';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { messageCircleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/message-circle-check';
import { messageCirclePlusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/message-circle-plus';

/**
 * The line note's button and field (FR-CART-08): a bubble, a modal on a phone.
 * It holds no note: the buy controls own the text and decide when it opens,
 * since its bubble competes with the others for the one place.
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
    <!-- The product's question is the placeholder: read while empty. -->
    <ng-template #field>
      <label class="block text-left">
        <span uiFieldLabel>{{ text.noteLabel }}</span>
        <textarea
          uiInput
          uiAutoGrow
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

    <!-- Marked either way, as the pairing marker beside it: greyed read as
         unavailable. The glyph says whether anything is written. -->
    <button
      type="button"
      uiIconButton
      variant="marked"
      [attr.aria-label]="written() ? text.noteEdit : text.noteAdd"
      [title]="written() ? text.noteEdit : text.noteAdd"
      (click)="requestOpen.emit()"
    >
      <ui-icon
        [glyph]="written() ? messageCircleCheckIcon : messageCirclePlusIcon"
      />
    </button>

    @if (open()) {
      <!-- On a phone a modal: with the keyboard up nothing is beside
           anything, and it needs a way out other than the page behind. -->
      @if (narrow()) {
        <dialog
          #dialog
          uiDialogPanel
          [attr.aria-label]="text.noteLabel"
          (cancel)="cancelled.emit()"
        >
          <ng-container [ngTemplateOutlet]="field" />
          <!-- A modal has no "away", so it gets two answers. -->
          <div uiDialogActions>
            <button
              uiButton
              variant="secondary"
              type="button"
              (click)="cancelled.emit()"
            >
              {{ actionText.cancel }}
            </button>
            <button uiButton type="button" (click)="done.emit()">
              {{ actionText.done }}
            </button>
          </div>
        </dialog>
      } @else {
        <!-- Upwards, off the stepper and the button. -->
        <ui-popover
          align="end"
          placement="above"
          [roomy]="true"
          (dismissed)="dismissed.emit()"
        >
          <ng-container [ngTemplateOutlet]="field" />
        </ui-popover>
      }
    }
  `,
})
export class ProductNoteEditor {
  protected readonly messageCircleCheckIcon = messageCircleCheckIcon;
  protected readonly messageCirclePlusIcon = messageCirclePlusIcon;
  protected readonly text = inject(STOREFRONT_TEXT).cart;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly noteMax = CART_NOTE_MAX;

  /** A view of the note, never the copy of record. */
  readonly value = input.required<string>();
  readonly prompt = input.required<string>();
  readonly open = input(false);

  /** Whether that opens the field is the caller's call. */
  readonly requestOpen = output<void>();
  readonly valueChange = output<string>();
  /** The field was left, which records a note. */
  readonly save = output<void>();
  /** The modal's two answers; a bubble's only way out is `dismissed`. */
  readonly done = output<void>();
  readonly cancelled = output<void>();
  readonly dismissed = output<void>();

  protected readonly written = computed(() => this.value().trim() !== '');

  /** Safe under SSR: nothing reads it before the note is opened. */
  protected readonly narrow = injectNarrowScreen('sm');
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // `showModal()` for the focus trap and top layer; removing the <dialog>
    // closes it.
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  protected onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLTextAreaElement).value);
  }
}
