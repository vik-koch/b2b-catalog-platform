import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, inject, input, output, signal } from '@angular/core';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  CatalogImage,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../config/admin-text';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { FieldLabel } from '../ui/field-label';
import { MediaService } from './media.service';

/**
 * The product's ordered image gallery (FR-CAT-04/05). Uploads go through the
 * catalog media endpoint, which returns the stored `{ full, thumb }` pair; the
 * list order is the display order. Reordering is by CDK drag-drop, shared in
 * spirit with the category tree; the upload tile is excluded from the drop list.
 */
@Component({
  selector: 'app-product-image-gallery',
  imports: [LucideIcon, CdkDropList, CdkDrag, CdkDragPlaceholder, FieldLabel],
  template: `
    <fieldset>
      <legend appFieldLabel>{{ text.heading }}</legend>

      <ul
        class="flex flex-wrap items-stretch gap-3"
        cdkDropList
        cdkDropListOrientation="mixed"
        (cdkDropListDropped)="onDrop($event)"
      >
        @for (image of value(); track image.thumb) {
          <li
            cdkDrag
            [cdkDragData]="image"
            class="relative h-28 w-28 cursor-grab overflow-hidden rounded-md border border-border active:cursor-grabbing"
            [attr.aria-label]="common.reorder"
          >
            <img
              [src]="image.thumb"
              alt=""
              class="pointer-events-none h-full w-full object-cover"
            />
            <!-- A thin insertion caret rather than a full-size box: in the
                 single horizontal row it reads as "drops here"; when the row
                 wraps on narrow screens it simply sits at the row it lands in. -->
            <div
              *cdkDragPlaceholder
              class="h-28 w-1 self-center rounded-full bg-primary"
            ></div>
            <div
              class="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 p-1"
            >
              <span class="p-0.5 text-white/70">
                <app-lucide-icon name="grip-vertical" class="h-4 w-4" />
              </span>
              <button
                type="button"
                class="p-0.5 text-white/90 hover:text-white"
                [attr.aria-label]="common.remove"
                (click)="remove($index)"
              >
                <app-lucide-icon name="trash-2" class="h-4 w-4" />
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
            class="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-subtle transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            [disabled]="uploading()"
            (click)="fileInput.click()"
          >
            <app-lucide-icon name="image-plus" class="h-6 w-6" />
            <span class="text-xs">
              {{ uploading() ? common.uploading : text.add }}
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
  protected readonly text = inject(ADMIN_TEXT).productEditor.images;
  protected readonly common = inject(ADMIN_TEXT).common;
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
      this.error.set(this.common.uploadError);
    } finally {
      this.uploading.set(false);
    }
  }

  protected remove(index: number): void {
    this.valueChange.emit(this.value().filter((_, i) => i !== index));
  }

  protected onDrop(event: CdkDragDrop<CatalogImage[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const images = [...this.value()];
    moveItemInArray(images, event.previousIndex, event.currentIndex);
    this.valueChange.emit(images);
  }
}
