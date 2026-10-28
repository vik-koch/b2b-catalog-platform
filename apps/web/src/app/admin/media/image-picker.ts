import { Component, inject, input, output, signal } from '@angular/core';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  CatalogImage,
  fillText,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { DropZone } from '../../shared/ui/drop-zone';
import { FileTarget, pasteKeys } from '../../shared/ui/file-target';
import { MediaService } from './media.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { ErrorText } from '../../shared/ui/error-text';
import { imagePlusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/image-plus';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';

/**
 * A single catalog image — the one-image counterpart to ProductImageGallery,
 * deliberately built from the same tile and the same dashed add-button so a
 * category's image control reads as the same thing as a product's. What it drops
 * is everything about *order*: there is no drag handle and no drop list, because
 * one image has no order to change.
 */
@Component({
  selector: 'app-image-picker',
  imports: [Icon, FileTarget, ErrorText, DropZone],
  template: `
    @if (value(); as image) {
      <div
        class="relative size-26 overflow-hidden rounded-md border border-edge
               bg-white"
      >
        <img [src]="image.thumb" alt="" class="size-full object-cover" />
        <div
          class="absolute inset-x-0 bottom-0 flex justify-end bg-black/45 p-1"
        >
          <button
            type="button"
            class="cursor-pointer p-1.5 inline-flex items-center
                   justify-center text-white/90
                   hover:text-white
                   md:p-1"
            [attr.aria-label]="actionText.remove"
            (click)="valueChange.emit(null)"
          >
            <app-icon [glyph]="trash2Icon" class="size-5 md:size-4" />
          </button>
        </div>
      </div>
    } @else {
      <input
        #fileInput
        type="file"
        class="hidden"
        [accept]="accept"
        (change)="onFile($event)"
      />
      <button
        type="button"
        [appFileTarget]="accept"
        appDropZone
        class="size-26"
        [disabled]="uploading()"
        (click)="fileInput.click()"
        (filesReceived)="upload($event[0])"
      >
        <app-icon [glyph]="imagePlusIcon" class="size-6" />
        <span class="text-xs">{{
          uploading() ? adminText.upload.progress : label()
        }}</span>
      </button>
      <!-- A pointer's hint: a phone has no shortcut, and drops nothing. -->
      <p class="mt-2 hidden text-xs text-ink-subtle pointer-fine:block">
        {{ tileHint }}
      </p>
    }

    @if (error()) {
      <p appErrorText class="mt-2" role="alert">{{ error() }}</p>
    }
  `,
})
export class ImagePicker {
  protected readonly imagePlusIcon = imagePlusIcon;
  protected readonly trash2Icon = trash2Icon;
  private readonly media = inject(MediaService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly accept = ACCEPTED_IMAGE_MIME_TYPES.join(',');
  protected readonly tileHint = fillText(this.adminText.upload.tileHint, {
    keys: pasteKeys(),
  });

  readonly value = input.required<CatalogImage | null>();
  /** Caption on the empty tile, e.g. "Image". */
  readonly label = input.required<string>();
  /** Store the upload centre-cropped to a square (a category mark). The tile
   * below draws every picture cropped to its square anyway, so this is what
   * makes the preview the truth rather than a framing of it. */
  readonly square = input(false);
  readonly valueChange = output<CatalogImage | null>();

  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (file) await this.upload(file);
  }

  protected async upload(file: File): Promise<void> {
    this.uploading.set(true);
    this.error.set(null);
    try {
      this.valueChange.emit(
        await this.media.uploadCatalogImage(file, this.square()),
      );
    } catch {
      this.error.set(this.adminText.upload.error);
    } finally {
      this.uploading.set(false);
    }
  }
}
