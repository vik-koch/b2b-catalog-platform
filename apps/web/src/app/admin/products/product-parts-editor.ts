import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  fillText,
  isValidPart,
  parsePartList,
  PRODUCT_PART_MAX_LENGTH,
  PRODUCT_PARTS_MAX,
  PRODUCT_PARTS_MIN,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Button } from '../../ui/button';
import {
  DISCLOSURE_FRAME,
  disclosureBorder,
  DisclosureToggle,
} from '../../ui/disclosure-toggle';
import { FieldLabel } from '../../ui/field-label';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';

/** `aria-controls` must name one panel, and a page may hold more than one. */
let nextId = 0;

/**
 * The parts one piece of this product is made of, where it is sold as a set
 * (FR-CAT-10) — a cup and its lid on one page at one price.
 *
 * A list of words rather than one text field, so each part is visibly one
 * thing and the rule a set has to meet — two or three different ones — can be
 * said about the list instead of about a string. The field still takes
 * "cup + lid" in one go: that is how the badge writes it, and how an admin
 * copying it from elsewhere will type it.
 *
 * A disclosure like the pairings beside it, for the same reason: there is no
 * stored flag to tick, and the lid's count says whether this product is a set
 * without opening it.
 */
@Component({
  selector: 'app-product-parts-editor',
  imports: [AdminIcon, Button, DisclosureToggle, FieldLabel, IconButton, Input],
  host: { class: 'block' },
  template: `
    <div
      class="max-w-xl rounded-md border"
      [class]="frame + ' ' + disclosureBorder(open())"
    >
      <app-disclosure-toggle
        [label]="text.heading"
        [count]="value().length"
        [countLabel]="countLabel()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      />
      @if (open()) {
        <div [id]="panelId" class="border-t border-border p-4">
          <p class="text-xs text-subtle">{{ text.hint }}</p>

          @if (value().length > 0) {
            <ul class="mt-3 divide-y divide-border border-y border-border">
              @for (part of value(); track part) {
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <span class="min-w-0 flex-1 truncate">{{ part }}</span>
                  <button
                    appIconButton
                    type="button"
                    [attr.aria-label]="removeLabel(part)"
                    (click)="remove(part)"
                  >
                    <app-admin-icon name="x" />
                  </button>
                </li>
              }
            </ul>
          }
          @if (tooFew()) {
            <p class="mt-2 text-xs text-red-700">{{ text.tooFew }}</p>
          }

          @if (value().length >= max) {
            <p class="mt-3 text-xs text-subtle">{{ limitLabel() }}</p>
          } @else {
            <div class="mt-3">
              <label [for]="inputId" appFieldLabel>{{ text.add }}</label>
              <div class="flex gap-2">
                <input
                  [id]="inputId"
                  type="text"
                  appInput
                  class="min-w-0 flex-1"
                  autocomplete="off"
                  [attr.aria-invalid]="rejected() ? true : null"
                  [value]="draft()"
                  [placeholder]="text.addPlaceholder"
                  (input)="type($any($event.target).value)"
                  (keydown.enter)="$event.preventDefault(); add()"
                />
                <button
                  appButton
                  variant="secondary"
                  type="button"
                  [disabled]="draft().trim() === ''"
                  (click)="add()"
                >
                  {{ text.addButton }}
                </button>
              </div>
              @if (rejected()) {
                <p class="mt-1 text-xs text-red-700">{{ rejectedLabel() }}</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ProductPartsEditor implements OnInit {
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly disclosureBorder = disclosureBorder;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor.parts;

  readonly value = input.required<readonly string[]>();
  readonly valueChange = output<string[]>();

  protected readonly max = PRODUCT_PARTS_MAX;
  protected readonly open = signal(false);
  protected readonly draft = signal('');
  /** Set by a refused add and cleared by the next keystroke, so the field does
   * not complain about text that is still being typed. */
  protected readonly rejected = signal(false);
  protected readonly panelId = `parts-panel-${++nextId}`;
  protected readonly inputId = `parts-add-${nextId}`;

  /** One part is a product, not a set — said under the list until a second is
   * added or the first removed, and refused by the save. */
  protected readonly tooFew = computed(
    () => this.value().length > 0 && this.value().length < PRODUCT_PARTS_MIN,
  );

  protected readonly countLabel = computed(() =>
    fillText(this.common.countSuffix, { count: this.value().length }),
  );

  protected readonly limitLabel = computed(() =>
    fillText(this.text.limit, { count: this.max }),
  );

  protected readonly rejectedLabel = computed(() =>
    fillText(this.text.rejected, { max: PRODUCT_PART_MAX_LENGTH }),
  );

  /** Open where there is something to see; read once, as the pairings do. */
  ngOnInit(): void {
    this.open.set(this.value().length > 0);
  }

  protected type(value: string): void {
    this.draft.set(value);
    this.rejected.set(false);
  }

  /**
   * Adds what the field holds — one part, or several written "cup + lid". All
   * or nothing: a list that took the first half of a typo would leave the
   * admin working out which half.
   */
  protected add(): void {
    const added = parsePartList(this.draft());
    if (added.length === 0) return;
    const next = [...this.value(), ...added];
    const acceptable =
      next.length <= this.max &&
      added.every(isValidPart) &&
      new Set(next).size === next.length;
    if (!acceptable) {
      this.rejected.set(true);
      return;
    }
    this.valueChange.emit(next);
    this.draft.set('');
  }

  protected remove(part: string): void {
    this.valueChange.emit(this.value().filter((p) => p !== part));
  }

  protected removeLabel(part: string): string {
    return fillText(this.text.remove, { name: part });
  }
}
