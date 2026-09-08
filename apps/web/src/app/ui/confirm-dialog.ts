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
import { Button } from './button';
import { Checkbox } from './checkbox';
import { AutoGrow } from './auto-grow';
import { FieldLabel } from './field-label';
import { Input } from './input';
import { DialogActions } from './dialog-actions';
import { DialogPanel } from './dialog-panel';

/**
 * One thing that happens because the answer was yes, offered as a tick.
 *
 * A choice and not a second question: the dialog's own question has already
 * been asked, and this is what rides along with it.
 */
export interface ConfirmCheck {
  key: string;
  label: string;
  /** The line under it, where the tick needs a word of explanation. */
  hint?: string;
  /** How it is offered. The caller works out the answer that is right almost
   * always, and the person confirming overrides it. */
  checked: boolean;
}

/** What a confirmed dialog answers with: the reason as typed, and how every
 * choice was left. */
export interface ConfirmAnswer {
  reason: string;
  checks: Record<string, boolean>;
}

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
  imports: [
    AutoGrow,
    Button,
    Checkbox,
    DialogActions,
    DialogPanel,
    FieldLabel,
    Input,
  ],
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

      @for (check of checks(); track check.key) {
        <label class="mt-4 flex items-start gap-2 text-sm">
          <input
            appCheckbox
            type="checkbox"
            class="mt-0.5"
            [checked]="ticked()[check.key]"
            (change)="tick(check.key, $any($event.target).checked)"
          />
          <span>
            {{ check.label }}
            @if (check.hint) {
              <span class="block text-xs text-subtle">{{ check.hint }}</span>
            }
          </span>
        </label>
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
          (click)="
            confirmed.emit({ reason: reason().trim(), checks: ticked() })
          "
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
  /**
   * Choices that ride along with the answer — the things that happen *because*
   * of it rather than parts of it: writing to the customer about a move,
   * recording the money that came with the goods.
   *
   * Here rather than in a screen of its own because they are answered in the
   * same breath as the question: a manager pressing "Complete" is deciding all
   * of it at once, and a second dialog for the consequences of the first is a
   * click nobody wants.
   */
  readonly checks = input<readonly ConfirmCheck[]>([]);
  readonly reasonMaxLength = input<number>(500);
  /** Whether the answer is refused without one. A reason quoted *at* somebody
   * has to exist; one quoted at the shop is a courtesy. */
  readonly reasonRequired = input(true);

  /** The reason as typed — an empty string where none was asked for — and how
   * every choice was left. */
  readonly confirmed = output<ConfirmAnswer>();
  readonly cancelled = output<void>();

  protected readonly reason = signal('');
  /**
   * Each choice as it now stands, seeded from how it was offered. A
   * `linkedSignal` and not a constructor assignment: inputs are set after the
   * component is created, so a value read in the constructor is the default
   * and never the caller's.
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

  protected tick(key: string, on: boolean): void {
    this.ticked.update((state) => ({ ...state, [key]: on }));
  }

  constructor() {
    // showModal() must be called imperatively for the focus trap and backdrop;
    // the host destroys this component to close, and a removed dialog is closed.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
}
