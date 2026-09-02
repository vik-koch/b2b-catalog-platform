import { Component, inject, input, output, signal } from '@angular/core';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  CatalogImage,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { MediaService } from './media.service';

/**
 * A single catalog image — the one-image counterpart to ProductImageGallery,
 * deliberately built from the same tile and the same dashed add-button so a
 * category's image control reads as the same thing as a product's. What it drops
 * is everything about *order*: there is no drag handle and no drop list, because
 * one image has no order to change.
 */
@Component({
  selector: 'app-image-picker',
  imports: [AdminIcon],
  template: `
    @if (value(); as image) {
      <div
        class="relative h-28 w-28 overflow-hidden rounded-md border border-border"
      >
        <img [src]="image.thumb" alt="" class="h-full w-full object-cover" />
        <div
          class="absolute inset-x-0 bottom-0 flex justify-end bg-black/45 p-1"
        >
          <button
            type="button"
            class="cursor-pointer p-1.5 inline-flex items-center justify-center text-white/90 hover:text-white md:p-1"
            [attr.aria-label]="common.remove"
            (click)="valueChange.emit(null)"
          >
            <app-admin-icon name="trash-2" class="size-5 md:size-4" />
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
        class="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-subtle transition-colors hover:border-primary hover:text-accent disabled:opacity-50"
        [disabled]="uploading()"
        (click)="fileInput.click()"
      >
        <app-admin-icon name="image-plus" class="h-6 w-6" />
        <span class="text-xs">{{
          uploading() ? common.uploading : label()
        }}</span>
      </button>
    }

    @if (error()) {
      <p class="mt-2 text-sm text-red-700" role="alert">{{ error() }}</p>
    }
  `,
})
export class ImagePicker {
  private readonly media = inject(MediaService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly accept = ACCEPTED_IMAGE_MIME_TYPES.join(',');

  readonly value = input.required<CatalogImage | null>();
  /** Caption on the empty tile, e.g. "Image". */
  readonly label = input.required<string>();
  readonly valueChange = output<CatalogImage | null>();

  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;

    this.uploading.set(true);
    this.error.set(null);
    try {
      this.valueChange.emit(await this.media.uploadCatalogImage(file));
    } catch {
      this.error.set(this.common.uploadError);
    } finally {
      this.uploading.set(false);
    }
  }
}
