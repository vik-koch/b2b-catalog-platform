import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  isValidPart,
  parsePartList,
  PRODUCT_PART_MAX_LENGTH,
  PRODUCT_PARTS_MAX,
  PRODUCT_PARTS_MIN,
} from '@b2b-catalog-platform/shared/core/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { PRODUCT_FEATURE_GLYPHS } from './product-feature-glyphs';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** `aria-controls` must name one panel, and a page may hold more than one. */
let nextId = 0;

/**
 * The parts of a product sold as a set (FR-CAT-10), a cup and its lid. A list,
 * so the set's rule (two or three different parts) is about the list; the
 * field still takes "cup + lid" at once, as the badge writes it.
 */
@Component({
  selector: 'app-product-parts-editor',
  imports: [
    Icon,
    Button,
    DisclosureToggle,
    FieldLabel,
    IconButton,
    Input,
    ErrorText,
    DisclosureFrame,
  ],
  host: { class: 'block' },
  template: `
    <div class="max-w-xl rounded-md border" uiDisclosureFrame [open]="open()">
      <ui-disclosure-toggle
        [label]="text.heading"
        [count]="value().length"
        [countLabel]="countLabel()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      >
        <ui-icon
          disclosureLead
          [glyph]="glyph"
          class="size-4 text-ink-subtle"
        />
      </ui-disclosure-toggle>
      @if (open()) {
        <div [id]="panelId" class="border-t border-edge p-4">
          <p class="text-xs text-ink-subtle">{{ text.hint }}</p>

          @if (value().length > 0) {
            <ul class="mt-3 divide-y divide-edge border-y border-edge">
              @for (part of value(); track part) {
                <li class="flex items-center gap-2 py-1.5 text-sm">
                  <span class="min-w-0 flex-1 truncate">{{ part }}</span>
                  <button
                    uiIconButton
                    type="button"
                    [attr.aria-label]="removeLabel(part)"
                    (click)="remove(part)"
                  >
                    <ui-icon [glyph]="xIcon" />
                  </button>
                </li>
              }
            </ul>
          }
          @if (tooFew()) {
            <p uiErrorText class="mt-2">{{ text.tooFew }}</p>
          }

          @if (value().length >= max) {
            <p class="mt-3 text-xs text-ink-subtle">{{ limitLabel() }}</p>
          } @else {
            <div class="mt-3">
              <label [for]="inputId" uiFieldLabel>{{ text.add }}</label>
              <div class="flex gap-2">
                <input
                  [id]="inputId"
                  type="text"
                  uiInput
                  class="min-w-0 flex-1"
                  autocomplete="off"
                  [attr.aria-invalid]="rejected() ? true : null"
                  [value]="draft()"
                  [placeholder]="text.addPlaceholder"
                  (input)="type($any($event.target).value)"
                  (keydown.enter)="$event.preventDefault(); add()"
                />
                <button
                  uiButton
                  variant="secondary"
                  type="button"
                  [disabled]="draft().trim() === ''"
                  (click)="add()"
                >
                  {{ text.addButton }}
                </button>
              </div>
              @if (rejected()) {
                <p uiErrorText class="mt-1">{{ rejectedLabel() }}</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ProductPartsEditor implements OnInit {
  protected readonly xIcon = xIcon;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.parts;
  protected readonly glyph = PRODUCT_FEATURE_GLYPHS.set;

  readonly value = input.required<readonly string[]>();
  readonly valueChange = output<string[]>();

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly max = PRODUCT_PARTS_MAX;
  protected readonly open = signal(false);
  protected readonly draft = signal('');
  /** Cleared by the next keystroke: text still being typed is not wrong yet. */
  protected readonly rejected = signal(false);
  protected readonly panelId = `parts-panel-${++nextId}`;
  protected readonly inputId = `parts-add-${nextId}`;

  /** One part is a product, not a set; the save refuses it too. */
  protected readonly tooFew = computed(
    () => this.value().length > 0 && this.value().length < PRODUCT_PARTS_MIN,
  );

  protected readonly countLabel = computed(() =>
    fillText(this.adminText.countSuffix, { count: this.value().length }),
  );

  protected readonly limitLabel = computed(() =>
    fillText(this.text.limit, { count: this.max }),
  );

  protected readonly rejectedLabel = computed(() =>
    fillText(this.text.rejected, { max: PRODUCT_PART_MAX_LENGTH }),
  );

  /** Opens only on load: closing when the last part went would take the
   * field that adds one with it. */
  ngOnInit(): void {
    this.open.set(this.value().length > 0);
  }

  /** Opened and brought into view, for a save this list stopped. */
  reveal(): void {
    this.open.set(true);
    this.host.scrollIntoView({ block: 'nearest' });
  }

  protected type(value: string): void {
    this.draft.set(value);
    this.rejected.set(false);
  }

  /** All or nothing: taking half of a typo would leave the admin working out
   * which half. */

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
    return fillText(this.text.removeAria, { name: part });
  }
}
