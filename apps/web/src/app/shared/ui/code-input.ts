import {
  Component,
  OnInit,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

/**
 * A short numeric code as a row of boxes, one digit each (FR-AUTH-12).
 *
 * One real input lies over the boxes, so everything a field already does keeps
 * working: a phone offering the code from a message, paste, backspace, delete,
 * the arrow keys, and a screen reader meeting one field rather than six. The
 * boxes only draw what the input holds and where its caret is.
 *
 * Two things differ from a plain field, both because the boxes promise them.
 * Typing over a filled box replaces its digit rather than pushing the rest
 * along, and clicking a box puts the caret on it.
 */
@Component({
  selector: 'app-code-input',
  imports: [ReactiveFormsModule],
  host: { class: 'block' },
  template: `
    <!-- A block-level row, not inline-flex: an inline box takes its height
         from its content's baseline, and the caret appearing in an empty box
         on focus moved everything below it. -->
    <div class="group relative flex w-fit gap-2">
      @for (slot of slots(); track $index) {
        <div
          aria-hidden="true"
          class="flex h-12 w-10 items-center justify-center rounded-md border bg-white text-xl tabular-nums transition-colors sm:w-11"
          [class]="slotClass($index)"
        >
          @if (slot) {
            {{ slot }}
          } @else if (focused() && $index === active()) {
            <span
              class="h-6 w-px animate-caret-blink bg-current motion-reduce:animate-none"
            ></span>
          }
        </div>
      }
      <input
        #field
        [id]="inputId()"
        [formControl]="control()"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        aria-required="true"
        [attr.maxlength]="length()"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="describedBy() || null"
        class="absolute inset-0 size-full cursor-text border-0 bg-transparent text-transparent caret-transparent selection:bg-transparent focus-visible:outline-none"
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
export class CodeInput implements OnInit {
  readonly control = input.required<FormControl<string>>();
  readonly length = input(6);
  readonly inputId = input('code');
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);

  /** Every box is filled. */
  readonly completed = output<string>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly field =
    viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly focused = signal(false);
  private readonly caret = signal(0);
  private readonly value = signal('');

  protected readonly slots = computed(() => {
    const value = this.value();
    return Array.from({ length: this.length() }, (_, i) => value[i] ?? '');
  });

  /** The box the next digit lands in. */
  protected readonly active = computed(() =>
    Math.min(this.caret(), this.length() - 1),
  );

  ngOnInit(): void {
    // The control is the truth: a reset from the form has to reach the boxes.
    const control = this.control();
    this.value.set(control.value);
    control.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.value.set(value ?? '');
        // A reset from outside empties the boxes; the caret goes with it, or
        // it would be drawn in a box past the end.
        this.caret.update((at) => Math.min(at, (value ?? '').length));
      });
  }

  focus(): void {
    this.field().nativeElement.focus();
  }

  protected slotClass(index: number): string {
    const active = this.focused() && index === this.active();
    if (active) {
      return 'border-secondary outline outline-1 -outline-offset-1 outline-secondary';
    }
    if (this.invalid()) return 'border-red-600';
    return 'border-border-strong group-hover:border-accent';
  }

  /** A digit typed into a filled box takes that box's place. */
  protected overwrite(event: InputEvent): void {
    if (event.inputType !== 'insertText' || !event.data) return;
    const el = this.field().nativeElement;
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
    const el = this.field().nativeElement;
    const digits = el.value.replace(/\D/g, '').slice(0, this.length());
    if (digits !== el.value) {
      this.write(digits, digits.length);
      return;
    }
    this.afterChange();
  }

  /** A click lands on the box under the pointer, never past the last digit. */
  protected pointAt(event: MouseEvent): void {
    const el = this.field().nativeElement;
    const box = el.getBoundingClientRect();
    const index = Math.floor(
      ((event.clientX - box.left) / box.width) * this.length(),
    );
    const at = Math.max(0, Math.min(index, el.value.length));
    // After the browser has placed its own caret, which is what it does on
    // mousedown.
    requestAnimationFrame(() => {
      el.setSelectionRange(at, at);
      this.track();
    });
  }

  protected track(): void {
    this.caret.set(this.field().nativeElement.selectionStart ?? 0);
  }

  private write(value: string, caret: number): void {
    const el = this.field().nativeElement;
    el.value = value;
    this.control().setValue(value);
    el.setSelectionRange(caret, caret);
    this.afterChange();
  }

  private afterChange(): void {
    const value = this.field().nativeElement.value;
    // Which input listener runs first, the form's or this one, is not ours to
    // decide; the control has to hold the value before `completed` is heard.
    if (this.control().value !== value) this.control().setValue(value);
    this.value.set(value);
    this.track();
    if (value.length === this.length()) this.completed.emit(value);
  }
}
