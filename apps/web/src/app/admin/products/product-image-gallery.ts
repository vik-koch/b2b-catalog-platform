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
} from '@b2b-catalog-platform/shared';
import {
  ProductImageInput,
  ProductVariantInput,
} from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import { DropZone } from '@b2b-catalog-platform/ui/inputs/drop-zone';
import {
  FileTarget,
  pasteKeys,
} from '@b2b-catalog-platform/ui/inputs/file-target';
import { ImageFramerService } from '../media/image-framer.service';
import { MediaService } from '../media/media.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { cropIcon } from '@b2b-catalog-platform/ui/icons/glyphs/crop';
import { gripVerticalIcon } from '@b2b-catalog-platform/ui/icons/glyphs/grip-vertical';
import { imagePlusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/image-plus';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';

/**
 * The product's ordered image gallery (FR-CAT-04/05). Uploads go through the
 * catalog media endpoint, which returns the stored `{ full, thumb }` pair; the
 * list order is the display order. Reordering is by CDK drag-drop, shared in
 * spirit with the category tree; the upload tile is excluded from the drop list.
 *
 * A single new picture opens in the framer first, to be placed in a white
 * square; several at once were prepared elsewhere and go up as they are, each
 * one framed again from its tile if need be.
 *
 * Where the product names variants, each picture says under it which one it
 * shows, or none for a picture of the whole range (FR-CAT-11). The photo is
 * the drag handle then, so the picker under it can be used without starting a
 * drag.
 */
@Component({
  selector: 'app-product-image-gallery',
  imports: [
    Icon,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    FieldLabel,
    FileTarget,
    Input,
    SelectInput,
    ErrorText,
    DropZone,
  ],
  template: `
    <fieldset class="max-w-xl">
      <legend uiFieldLabel>{{ text.heading }}</legend>

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
              class="relative size-26 cursor-grab overflow-hidden rounded-md
                     border border-edge bg-white
                     active:cursor-grabbing"
              [attr.aria-label]="adminText.actions.reorder"
            >
              <img
                [src]="image.thumb"
                alt=""
                class="pointer-events-none size-full bg-white object-contain"
              />
              <div
                class="absolute inset-x-0 bottom-0 flex justify-between
                       bg-black/45 p-1"
              >
                <span class="p-1.5 inline-flex text-white/70 md:p-1">
                  <ui-icon
                    [glyph]="gripVerticalIcon"
                    class="size-5 md:size-4"
                  />
                </span>
                <span class="flex">
                  <button
                    type="button"
                    class="cursor-pointer p-1.5 inline-flex items-center
                           justify-center text-white/90
                           hover:text-white
                           disabled:cursor-not-allowed disabled:text-white/40
                           md:p-1"
                    [attr.aria-label]="text.reframe"
                    [title]="text.reframe"
                    [disabled]="uploading()"
                    (click)="reframe(image)"
                  >
                    <ui-icon [glyph]="cropIcon" class="size-5 md:size-4" />
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer p-1.5 inline-flex items-center
                           justify-center text-white/90
                           hover:text-white
                           md:p-1"
                    [attr.aria-label]="actionText.remove"
                    (click)="remove($index)"
                  >
                    <ui-icon [glyph]="trash2Icon" class="size-5 md:size-4" />
                  </button>
                </span>
              </div>
            </div>
            @if (variants().length) {
              <ui-select-input size="sm">
                <select
                  uiInput
                  size="sm"
                  class="w-full truncate"
                  [attr.aria-label]="text.variantAria"
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
              </ui-select-input>
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
            [uiFileTarget]="accept"
            [fileTargetMultiple]="true"
            uiDropZone
            class="size-26"
            [disabled]="uploading()"
            (click)="fileInput.click()"
            (filesReceived)="upload($event)"
          >
            <ui-icon [glyph]="imagePlusIcon" class="size-6" />
            <span class="text-xs">
              {{ uploading() ? adminText.upload.progress : text.add }}
            </span>
          </button>
        </li>
      </ul>
      <!-- A pointer's hint: a phone has no shortcut, and drops nothing. -->
      <p class="mt-2 hidden text-xs text-ink-subtle pointer-fine:block">
        {{ tileHint }}
      </p>

      @if (error()) {
        <p uiErrorText class="mt-2" role="alert">{{ error() }}</p>
      }
    </fieldset>
  `,
})
export class ProductImageGallery {
  protected readonly cropIcon = cropIcon;
  protected readonly gripVerticalIcon = gripVerticalIcon;
  protected readonly imagePlusIcon = imagePlusIcon;
  protected readonly trash2Icon = trash2Icon;
  private readonly media = inject(MediaService);
  private readonly framer = inject(ImageFramerService);
  protected readonly text = inject(ADMIN_TEXT).products.editor.images;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly accept = ACCEPTED_IMAGE_MIME_TYPES.join(',');
  protected readonly tileHint = fillText(this.adminText.upload.tileHint, {
    keys: pasteKeys(),
  });

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
    if (files.length === 1 && files[0].type !== 'image/gif') {
      const framed = await this.frameNew(files[0]);
      if (!framed) return;
      files = [framed];
    }
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
      this.error.set(this.adminText.upload.error);
    } finally {
      this.uploading.set(false);
    }
  }

  /** A canvas draws one frame of an animation, so a GIF never reaches here. */
  private async frameNew(file: File): Promise<File | null> {
    const src = URL.createObjectURL(file);
    try {
      const answer = await this.framer.frame(src, true);
      if (answer === 'original') return file;
      return answer && new File([answer], 'framed.jpg', { type: answer.type });
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  /** Frames a stored picture again from its `full`, replacing it in place;
   * the old files are left to the unreferenced-upload clean-up. */
  protected async reframe(image: ProductImageInput): Promise<void> {
    const answer = await this.framer.frame(image.full, false);
    if (!(answer instanceof Blob)) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const stored = await this.media.uploadCatalogImage(
        new File([answer], 'framed.jpg', { type: answer.type }),
      );
      this.valueChange.emit(
        this.value().map((each) =>
          each.thumb === image.thumb ? { ...each, ...stored } : each,
        ),
      );
    } catch {
      this.error.set(this.adminText.upload.error);
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
