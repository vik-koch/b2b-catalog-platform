import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, inject, input, output, signal } from '@angular/core';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  fillText,
  ProductImageInput,
  ProductVariantInput,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { FieldLabel } from '../../ui/field-label';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { SelectField } from '../../ui/select-field';
import { DROP_ZONE, dropZoneState } from '../../ui/drop-zone';
import { FileTarget, pasteKeys } from '../../ui/file-target';
import { MediaService } from '../media/media.service';

/**
 * The product's ordered image gallery (FR-CAT-04/05). Uploads go through the
 * catalog media endpoint, which returns the stored `{ full, thumb }` pair; the
 * list order is the display order. Reordering is by CDK drag-drop, shared in
 * spirit with the category tree; the upload tile is excluded from the drop list.
 *
 * Where the product names variants, each picture says under it which one it
 * shows, or none for a picture of the whole range (FR-CAT-11). The photo is
 * the drag handle then, so the picker under it can be used without starting a
 * drag.
 */
@Component({
  selector: 'app-product-image-gallery',
  imports: [
    AdminIcon,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    FieldLabel,
    FileTarget,
    Input,
    SelectField,
  ],
  template: `
    <fieldset class="max-w-xl">
      <legend appFieldLabel>{{ text.heading }}</legend>

      <ul
        class="flex flex-wrap items-stretch gap-3.5"
        cdkDropList
        cdkDropListOrientation="mixed"
        (cdkDropListDropped)="onDrop($event)"
      >
        @for (image of value(); track image.thumb) {
          <li cdkDrag [cdkDragData]="image" class="flex w-26 flex-col gap-1.5">
            <!-- A thin insertion caret rather than a full-size box: in the
                 single horizontal row it reads as "drops here"; when the row
                 wraps on narrow screens it simply sits at the row it lands in. -->
            <div
              *cdkDragPlaceholder
              class="h-26 w-1 self-center rounded-full bg-primary"
            ></div>
            <div
              cdkDragHandle
              class="relative h-26 w-26 cursor-grab overflow-hidden rounded-md border border-border bg-white active:cursor-grabbing"
              [attr.aria-label]="common.reorder"
            >
              <img
                [src]="image.thumb"
                alt=""
                class="pointer-events-none h-full w-full bg-white object-contain"
              />
              <div
                class="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 p-1"
              >
                <span class="p-1.5 inline-flex text-white/70 md:p-1">
                  <app-admin-icon
                    name="grip-vertical"
                    class="size-5 md:size-4"
                  />
                </span>
                <button
                  type="button"
                  class="cursor-pointer p-1.5 inline-flex items-center justify-center text-white/90 hover:text-white md:p-1"
                  [attr.aria-label]="common.remove"
                  (click)="remove($index)"
                >
                  <app-admin-icon name="trash-2" class="size-5 md:size-4" />
                </button>
              </div>
            </div>
            @if (variants().length) {
              <app-select-field size="sm">
                <select
                  appInput
                  size="sm"
                  class="w-full truncate"
                  [attr.aria-label]="text.variant"
                  [title]="variantName(image.variantId)"
                  (change)="setVariant($index, $any($event.target).value)"
                >
                  <option value="" [selected]="!image.variantId">
                    {{ text.noVariant }}
                  </option>
                  @for (variant of variants(); track variant.id) {
                    <option
                      [value]="variant.id"
                      [selected]="variant.id === image.variantId"
                    >
                      {{ variant.name }}
                    </option>
                  }
                </select>
              </app-select-field>
            }
          </li>
        }

        <li>
          <input
            #fileInput
            type="file"
            class="hidden"
            [accept]="accept"
            multiple
            (change)="onFiles($event)"
          />
          <button
            type="button"
            #target="appFileTarget"
            [appFileTarget]="accept"
            [fileTargetMultiple]="true"
            [class]="tileClass(target.dragging())"
            [disabled]="uploading()"
            (click)="fileInput.click()"
            (filesReceived)="upload($event)"
          >
            <app-admin-icon name="image-plus" class="h-6 w-6" />
            <span class="text-xs">
              {{ uploading() ? common.uploading : text.add }}
            </span>
          </button>
        </li>
      </ul>
      <!-- A pointer's hint: a phone has no shortcut, and drops nothing. -->
      <p class="mt-2 hidden text-xs text-subtle pointer-fine:block">
        {{ tileHint }}
      </p>

      @if (error()) {
        <p class="mt-2 text-sm text-red-700" role="alert">{{ error() }}</p>
      }
    </fieldset>
  `,
})
export class ProductImageGallery {
  private readonly media = inject(MediaService);
  protected readonly text = inject(ADMIN_TEXT).productEditor.images;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly accept = ACCEPTED_IMAGE_MIME_TYPES.join(',');
  protected readonly tileHint = fillText(this.common.imageTileHint, {
    keys: pasteKeys(),
  });

  /** The shared dashed target at tile size — the same one the sync screen and
   * the document editor wear at their own. */
  protected tileClass(dragging: boolean): string {
    return `h-26 w-26 ${DROP_ZONE} ${dropZoneState(dragging)}`;
  }

  readonly value = input.required<ProductImageInput[]>();
  /** The variants a picture may show; none hides the picker. */
  readonly variants = input<readonly ProductVariantInput[]>([]);
  readonly valueChange = output<ProductImageInput[]>();

  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow re-selecting the same file
    await this.upload(files);
  }

  protected async upload(files: File[]): Promise<void> {
    if (files.length === 0) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const uploaded: ProductImageInput[] = [];
      for (const file of files) {
        const stored = await this.media.uploadCatalogImage(file);
        uploaded.push({ ...stored, variantId: null });
      }
      this.valueChange.emit([...this.value(), ...uploaded]);
    } catch {
      this.error.set(this.common.uploadError);
    } finally {
      this.uploading.set(false);
    }
  }

  protected remove(index: number): void {
    this.valueChange.emit(this.value().filter((_, i) => i !== index));
  }

  /** The picker's tooltip: its own box shortens a long name to a word. */
  protected variantName(id: string | null): string {
    return (
      this.variants().find((variant) => variant.id === id)?.name ??
      this.text.noVariant
    );
  }

  protected setVariant(index: number, variantId: string): void {
    this.valueChange.emit(
      this.value().map((image, i) =>
        i === index ? { ...image, variantId: variantId || null } : image,
      ),
    );
  }

  protected onDrop(event: CdkDragDrop<ProductImageInput[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const images = [...this.value()];
    moveItemInArray(images, event.previousIndex, event.currentIndex);
    this.valueChange.emit(images);
  }
}
