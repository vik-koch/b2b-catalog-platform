import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { Field } from './field';
import { FieldBinding } from './field-binding';

const slot = `flex h-12 w-10 items-center justify-center rounded-md border
              bg-white text-xl tabular-nums transition-colors
              sm:w-11`;

/** The box the next digit lands in, a refused code, and every other box. */
const slots = {
  active: `border-secondary outline outline-1 -outline-offset-1
           outline-secondary`,
  refused: 'border-danger',
  idle: 'border-edge-strong group-hover:border-accent',
} as const;

/**
 * A short numeric code as a row of boxes, one digit each. One real input lies
 * over them, so autofill from a message, paste, the arrow keys and a screen
 * reader all meet a single field; the boxes only draw it. Unlike a plain
 * field, typing over a filled box replaces its digit, and clicking a box puts
 * the caret on it. As many boxes as the field's `maxLength` rule allows.
 *
 *   <app-field [field]="form.code" [label]="text.code">
 *     <app-code-input [field]="form.code" />
 *   </app-field>
 */
@Component({
  selector: 'app-code-input',
  imports: [FormField, FieldBinding],
  host: { class: 'block' },
  template: `
    <!-- Block-level: as an inline box, the caret appearing on focus moved
         everything below it. -->
    <div class="group relative flex w-fit gap-2">
      @for (slot of slots(); track $index) {
        <div aria-hidden="true" [class]="slotClass($index)">
          @if (slot) {
            {{ slot }}
          } @else if (focused() && $index === active()) {
            <span
              class="h-6 w-px animate-caret-blink bg-current
                     motion-reduce:animate-none"
            ></span>
          }
        </div>
      }
      <input
        #typed
        [formField]="field()"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        class="absolute inset-0 size-full cursor-text border-0 bg-transparent
               text-transparent caret-transparent
               selection:bg-transparent
               focus-visible:outline-none"
        (beforeinput)="overwrite($event)"
        (input)="sanitize()"
        (focus)="focused.set(true); track()"
        (blur)="focused.set(false)"
        (keyup)="track()"
        (select)="track()"
        (mousedown)="pointAt($event)"
      />
    </div>
  `,
})
export class CodeInput {
  readonly field = input.required<FieldTree<string>>();
  protected readonly length = computed(() => this.field()().maxLength?.() ?? 6);

  /** Every box is filled. */
  readonly completed = output<string>();

  private readonly shell = inject(Field, { optional: true });
  private readonly typed =
    viewChild.required<ElementRef<HTMLInputElement>>('typed');
  protected readonly focused = signal(false);
  private readonly caret = signal(0);
  /** The field is the truth: a reset from the form reaches the boxes. */
  private readonly value = computed(() => this.field()().value());

  protected readonly slots = computed(() => {
    const value = this.value();
    return Array.from({ length: this.length() }, (_, i) => value[i] ?? '');
  });

  /**
   * The box the next digit lands in. Never past the digits there are: a
   * reset from outside empties the boxes without moving the caret.
   */
  protected readonly active = computed(() =>
    Math.min(this.caret(), this.value().length, this.length() - 1),
  );

  focus(): void {
    this.typed().nativeElement.focus();
  }

  protected slotClass(index: number): string {
    return `${slot} ${slots[this.slotState(index)]}`;
  }

  private slotState(index: number): keyof typeof slots {
    if (this.focused() && index === this.active()) return 'active';
    if (this.shell?.error()) return 'refused';
    return 'idle';
  }

  /** A digit typed into a filled box takes that box's place. */
  protected overwrite(event: InputEvent): void {
    if (event.inputType !== 'insertText' || !event.data) return;
    const el = this.typed().nativeElement;
    if (!/^\d$/.test(event.data)) {
      event.preventDefault();
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    if (start !== end || start >= el.value.length) return;

    event.preventDefault();
    const next =
      el.value.slice(0, start) + event.data + el.value.slice(start + 1);
    this.write(next, start + 1);
  }

  /** Whatever arrived — a paste, a suggestion from a message — as digits. */
  protected sanitize(): void {
    const el = this.typed().nativeElement;
    const digits = el.value.replace(/\D/g, '').slice(0, this.length());
    if (digits !== el.value) {
      this.write(digits, digits.length);
      return;
    }
    this.afterChange();
  }

  /** A click lands on the box under the pointer, never past the last digit. */
  protected pointAt(event: MouseEvent): void {
    const el = this.typed().nativeElement;
    const box = el.getBoundingClientRect();
    const index = Math.floor(
      ((event.clientX - box.left) / box.width) * this.length(),
    );
    const at = Math.max(0, Math.min(index, el.value.length));
    // After the browser has placed its own caret on mousedown.
    requestAnimationFrame(() => {
      el.setSelectionRange(at, at);
      this.track();
    });
  }

  protected track(): void {
    this.caret.set(this.typed().nativeElement.selectionStart ?? 0);
  }

  private write(value: string, caret: number): void {
    const el = this.typed().nativeElement;
    el.value = value;
    this.field()().value.set(value);
    el.setSelectionRange(caret, caret);
    this.afterChange();
  }

  private afterChange(): void {
    const value = this.typed().nativeElement.value;
    // The form's input listener may run after this one; the field has to hold
    // the value before `completed` is heard.
    const state = this.field()();
    if (state.value() !== value) state.value.set(value);
    this.track();
    if (value.length === this.length()) this.completed.emit(value);
  }
}
