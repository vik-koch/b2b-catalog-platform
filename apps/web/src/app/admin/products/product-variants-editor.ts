import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
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
  PRODUCT_VARIANT_NAME_MAX_LENGTH,
  PRODUCT_VARIANTS_MAX,
  ProductImageInput,
  ProductVariantInput,
  variantNameKey,
} from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { PRODUCT_FEATURE_GLYPHS } from './product-feature-glyphs';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { gripVerticalIcon } from '@b2b-catalog-platform/ui/icons/glyphs/grip-vertical';
import { imageIcon } from '@b2b-catalog-platform/ui/icons/glyphs/image';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** `aria-controls` must name one panel, and a page may hold more than one. */
let nextId = 0;

/**
 * The variants an assorted product's pictures show (FR-CAT-11/12): a name
 * each, in the order the storefront lists them, and whether it is currently
 * unavailable. Which picture shows which is chosen under the picture itself.
 *
 * Unavailable rather than deleted is the way to take a colour off the shelf
 * for a while: its pictures are withheld and come back with the mark cleared.
 * Deleting is for a variant that will never be offered again, and leaves its
 * pictures in the gallery without a label.
 *
 * The line note, which is how a customer picks among them, has its own box
 * beside this one: an assorted article may name variants the customer has no
 * say in, and a product may ask for a colour before its colours are
 * photographed.
 */
@Component({
  selector: 'app-product-variants-editor',
  imports: [
    Icon,
    Button,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    Checkbox,
    DisclosureToggle,
    FieldLabel,
    IconButton,
    Input,
    ErrorText,
    DisclosureFrame,
  ],
  host: { class: 'block' },
  template: `
    <div class="max-w-xl rounded-md border" appDisclosureFrame [open]="open()">
      <app-disclosure-toggle
        [label]="product.variants"
        [count]="value().length"
        [countLabel]="countLabel()"
        [open]="open()"
        [panelId]="panelId"
        (toggled)="open.set(!open())"
      >
        <app-icon
          disclosureLead
          [glyph]="glyph"
          class="size-4 text-ink-subtle"
        />
      </app-disclosure-toggle>
      @if (open()) {
        <div [id]="panelId" class="border-t border-edge p-4">
          <p class="text-xs text-ink-subtle">{{ text.hint }}</p>

          @if (value().length > 0) {
            <div class="@container/variants mt-3">
              <!-- The columns named once, where the row has them side by side.
                   On a phone the controls wrap under the name and say what
                   they are themselves. -->
              <div
                class="hidden items-end gap-x-2 pb-1.5 pl-6 text-xs/tight
                       text-ink-subtle
                       @min-[30rem]/variants:flex"
                aria-hidden="true"
              >
                <span class="flex-1"></span>
                <span class="w-10 text-right">{{ text.picturesHeading }}</span>
                <span class="w-24 text-center">{{ text.unavailable }}</span>
                <span class="w-6"></span>
              </div>
              <ul
                class="divide-y divide-edge border-y border-edge"
                cdkDropList
                (cdkDropListDropped)="onDrop($event)"
              >
                @for (variant of value(); track variant.id) {
                  <!-- One line where the panel has the room; on a phone the
                       name takes a line of its own and the controls go under
                       it, lined up with the field rather than the grip. No
                       ground of its own: only the copy under the pointer while
                       dragging needs one, and gets it as its preview — as a
                       list: the CDK adds a string as one token, and a space
                       in it throws before the drag starts. -->
                  <li
                    cdkDrag
                    [cdkDragPreviewClass]="previewClass"
                    class="flex flex-wrap items-center gap-x-2 gap-y-1.5
                           py-1.5 text-sm"
                  >
                    <span
                      cdkDragHandle
                      class="inline-flex cursor-grab text-ink-subtle
                             active:cursor-grabbing"
                      [attr.aria-label]="adminText.actions.reorder"
                    >
                      <app-icon [glyph]="gripVerticalIcon" class="size-4" />
                    </span>
                    <input
                      type="text"
                      appInput
                      size="sm"
                      class="min-w-0 flex-1 basis-[calc(100%-1.5rem)]
                             @min-[30rem]/variants:basis-0"
                      autocomplete="off"
                      [attr.aria-label]="text.nameAria"
                      [attr.maxlength]="nameMax"
                      [attr.aria-invalid]="clashes(variant) ? true : null"
                      [value]="variant.name"
                      (input)="rename(variant.id, $any($event.target).value)"
                    />
                    <span
                      class="ml-6 inline-flex shrink-0 items-center gap-1
                             text-xs text-ink-subtle
                             @min-[30rem]/variants:ml-0
                             @min-[30rem]/variants:w-10
                             @min-[30rem]/variants:justify-end"
                      [title]="picturesLabel(variant.id)"
                      [attr.aria-label]="picturesLabel(variant.id)"
                    >
                      <app-icon [glyph]="imageIcon" class="size-3.5" />
                      {{ pictureCount(variant.id) }}
                    </span>
                    <label
                      class="flex shrink-0 cursor-pointer items-center gap-1.5
                             text-xs
                             @min-[30rem]/variants:w-24
                             @min-[30rem]/variants:justify-center"
                    >
                      <input
                        type="checkbox"
                        appCheckbox
                        [checked]="variant.unavailable"
                        (change)="
                          setUnavailable(
                            variant.id,
                            $any($event.target).checked
                          )
                        "
                      />
                      <span class="@min-[30rem]/variants:sr-only">{{
                        text.unavailable
                      }}</span>
                    </label>
                    <button
                      appIconButton
                      type="button"
                      class="ml-auto @min-[30rem]/variants:ml-0"
                      [attr.aria-label]="removeLabel(variant.name)"
                      (click)="remove(variant.id)"
                    >
                      <app-icon [glyph]="xIcon" />
                    </button>
                  </li>
                }
              </ul>
            </div>
          }
          @if (hasClash()) {
            <p appErrorText class="mt-2">{{ text.duplicate }}</p>
          }
          @if (allWithheld()) {
            <p class="mt-2 text-xs text-warning">{{ text.allWithheld }}</p>
          }

          @if (value().length >= max) {
            <p class="mt-3 text-xs text-ink-subtle">{{ limitLabel() }}</p>
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
                  [attr.maxlength]="nameMax"
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
                <p appErrorText class="mt-1">{{ text.exists }}</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ProductVariantsEditor implements OnInit {
  protected readonly gripVerticalIcon = gripVerticalIcon;
  protected readonly imageIcon = imageIcon;
  protected readonly xIcon = xIcon;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.variants;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly glyph = PRODUCT_FEATURE_GLYPHS.variants;

  readonly value = input.required<readonly ProductVariantInput[]>();
  /** The gallery, read for how many pictures each variant has. */
  readonly images = input.required<readonly ProductImageInput[]>();
  readonly valueChange = output<ProductVariantInput[]>();

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly max = PRODUCT_VARIANTS_MAX;
  protected readonly nameMax = PRODUCT_VARIANT_NAME_MAX_LENGTH;
  protected readonly previewClass = ['bg-surface-subtle', 'shadow-md'];
  protected readonly open = signal(false);
  protected readonly draft = signal('');
  /** Set by a refused add and cleared by the next keystroke, as the parts
   * editor does, so the field does not complain about text still being typed. */
  protected readonly rejected = signal(false);
  protected readonly panelId = `variants-panel-${++nextId}`;
  protected readonly inputId = `variants-add-${nextId}`;

  protected readonly countLabel = computed(() =>
    fillText(this.adminText.countSuffix, { count: this.value().length }),
  );

  protected readonly limitLabel = computed(() =>
    fillText(this.text.limit, { count: this.max }),
  );

  /** A name another variant already has, or none at all — refused by the save. */
  protected readonly hasClash = computed(() =>
    this.value().some((variant) => this.clashes(variant)),
  );

  /** Every picture is withheld, so the storefront would show none (FR-CAT-12). */
  protected readonly allWithheld = computed(() => {
    const unavailable = new Set(
      this.value()
        .filter((variant) => variant.unavailable)
        .map((variant) => variant.id),
    );
    const images = this.images();
    return (
      images.length > 0 &&
      images.every(
        (image) => image.variantId !== null && unavailable.has(image.variantId),
      )
    );
  });

  /** Open where there is something to see; read once, as the parts do. */
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

  protected clashes(variant: ProductVariantInput): boolean {
    const key = variantNameKey(variant.name);
    return (
      key === '' ||
      this.value().some(
        (other) =>
          other.id !== variant.id && variantNameKey(other.name) === key,
      )
    );
  }

  protected pictureCount(id: string): number {
    return this.images().filter((image) => image.variantId === id).length;
  }

  protected picturesLabel(id: string): string {
    return fillText(this.text.pictures, { count: this.pictureCount(id) });
  }

  /** A name the list already has is refused with a word, not a dead button. */
  protected add(): void {
    const key = variantNameKey(this.draft());
    if (key === '') return;
    if (this.value().some((variant) => variantNameKey(variant.name) === key)) {
      this.rejected.set(true);
      return;
    }
    this.valueChange.emit([
      ...this.value(),
      {
        id: crypto.randomUUID(),
        name: this.draft().trim(),
        unavailable: false,
      },
    ]);
    this.draft.set('');
  }

  protected rename(id: string, name: string): void {
    this.update(id, { name });
  }

  protected setUnavailable(id: string, unavailable: boolean): void {
    this.update(id, { unavailable });
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((variant) => variant.id !== id));
  }

  protected removeLabel(name: string): string {
    return fillText(this.text.removeAria, { name });
  }

  protected onDrop(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.value()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.valueChange.emit(next);
  }

  private update(id: string, change: Partial<ProductVariantInput>): void {
    this.valueChange.emit(
      this.value().map((variant) =>
        variant.id === id ? { ...variant, ...change } : variant,
      ),
    );
  }
}
