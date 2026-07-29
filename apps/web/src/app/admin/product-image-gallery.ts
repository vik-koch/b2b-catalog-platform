import { Component, inject, input, output, signal } from '@angular/core';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  CatalogImage,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { MediaService } from './media.service';

/**
 * The product's ordered image gallery (FR-CAT-04/05). Uploads go through the
 * catalog media endpoint, which returns the stored `{ full, thumb }` pair; the
 * list order is the display order. Reordering is by move buttons for now (a
 * later pass may adopt CDK drag-drop, shared with the category tree).
 */
@Component({
  selector: 'app-product-image-gallery',
  imports: [LucideIcon],
  template: `
    <fieldset>
      <legend class="mb-1 block text-sm font-medium">{{ text.heading }}</legend>

      <ul class="flex flex-wrap items-stretch gap-3">
        @for (image of value(); track image.thumb) {
          <li
            class="relative h-28 w-28 overflow-hidden rounded-md border border-stone-200"
          >
            <img
              [src]="image.thumb"
              alt=""
              class="h-full w-full object-cover"
            />
            <div
              class="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 p-1"
            >
              <button
                type="button"
                class="p-0.5 text-white/90 hover:text-white disabled:opacity-30"
                [attr.aria-label]="text.moveUp"
                [disabled]="$index === 0"
                (click)="move($index, -1)"
              >
                <app-lucide-icon name="chevron-left" class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="p-0.5 text-white/90 hover:text-white"
                [attr.aria-label]="text.remove"
                (click)="remove($index)"
              >
                <app-lucide-icon name="trash-2" class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="p-0.5 text-white/90 hover:text-white disabled:opacity-30"
                [attr.aria-label]="text.moveDown"
                [disabled]="$index === value().length - 1"
                (click)="move($index, 1)"
              >
                <app-lucide-icon name="chevron-right" class="h-4 w-4" />
              </button>
            </div>
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
            class="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-stone-300 text-stone-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            [disabled]="uploading()"
            (click)="fileInput.click()"
          >
            <app-lucide-icon name="image-plus" class="h-6 w-6" />
            <span class="text-xs">
              {{ uploading() ? text.uploading : text.add }}
            </span>
          </button>
        </li>
      </ul>

      @if (error()) {
        <p class="mt-2 text-sm text-red-700" role="alert">{{ error() }}</p>
      }
    </fieldset>
  `,
})
export class ProductImageGallery {
  private readonly media = inject(MediaService);
  protected readonly text = inject(APP_TEXT).productEditor.images;
  protected readonly accept = ACCEPTED_IMAGE_MIME_TYPES.join(',');

  readonly value = input.required<CatalogImage[]>();
  readonly valueChange = output<CatalogImage[]>();

  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow re-selecting the same file
    if (files.length === 0) return;

    this.uploading.set(true);
    this.error.set(null);
    try {
      const uploaded: CatalogImage[] = [];
      for (const file of files) {
        uploaded.push(await this.media.uploadCatalogImage(file));
      }
      this.valueChange.emit([...this.value(), ...uploaded]);
    } catch {
      this.error.set(this.text.uploadError);
    } finally {
      this.uploading.set(false);
    }
  }

  protected remove(index: number): void {
    this.valueChange.emit(this.value().filter((_, i) => i !== index));
  }

  protected move(index: number, direction: -1 | 1): void {
    const images = [...this.value()];
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    [images[index], images[target]] = [images[target], images[index]];
    this.valueChange.emit(images);
  }
}
