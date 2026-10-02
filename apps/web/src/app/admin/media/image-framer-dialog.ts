import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  MEDIA_CATALOG_FULL_WIDTH,
  MEDIA_CATALOG_THUMB_WIDTH,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Button } from '../../ui/button';
import { DialogActions } from '../../ui/dialog-actions';
import { DialogPanel } from '../../ui/dialog-panel';
import { TextButton } from '../../ui/link';
import {
  clampFrame,
  filled,
  FITTED,
  Frame,
  outputSide,
  placement,
  ZOOM_MAX,
  ZOOM_MIN,
} from './image-frame';

/** Arrow keys move by this share of the square, Shift by five times it. */
const KEY_STEP = 0.01;
const ZOOM_KEY_FACTOR = 1.1;

/**
 * Places a picture in a white square before it is stored: dragged to move it,
 * zoomed out for a wider white border or in to crop. The result is drawn on a
 * canvas and handed back as a JPEG — white everywhere the picture is not, so a
 * transparent PNG comes out on white too.
 *
 * Rendered by `ImageFramerService` rather than used in templates directly.
 */
@Component({
  selector: 'app-image-framer-dialog',
  imports: [Button, DialogActions, DialogPanel, TextButton],
  template: `
    <dialog
      #dialog
      appDialogPanel
      size="lg"
      aria-labelledby="image-framer-heading"
      (cancel)="cancelled.emit()"
    >
      <h2 id="image-framer-heading" class="text-xl font-normal tracking-tight">
        {{ text.heading }}
      </h2>
      <p class="mt-3 text-sm text-muted">{{ text.hint }}</p>

      <!-- Capped by the screen's height too, so the controls under it stay in
           view on a phone held sideways. -->
      <div
        #stage
        tabindex="0"
        class="relative mx-auto mt-4 aspect-square w-full max-w-[55vh] cursor-grab touch-none overflow-hidden rounded-md border border-border-strong bg-white select-none active:cursor-grabbing"
        [attr.aria-label]="text.stage"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="dragFrom = null"
        (pointercancel)="dragFrom = null"
        (wheel)="onWheel($event)"
        (keydown)="onKey($event)"
      >
        <img
          #picture
          alt=""
          class="pointer-events-none absolute max-w-none"
          [src]="src()"
          [style.left.%]="box().left * 100"
          [style.top.%]="box().top * 100"
          [style.width.%]="box().width * 100"
          [style.height.%]="box().height * 100"
          (load)="onLoad()"
        />
      </div>

      <label class="mt-4 block">
        <span class="mb-1 flex justify-between text-sm font-medium">
          <span>{{ text.zoom }}</span>
          <span class="text-subtle">{{ zoomPercent() }}%</span>
        </span>
        <input
          type="range"
          class="w-full accent-primary"
          [min]="zoomMin"
          [max]="zoomMax"
          [value]="zoomPercent()"
          (input)="setZoom($any($event.target).valueAsNumber / 100)"
        />
      </label>
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <button type="button" appTextButton (click)="frame.set(fitted)">
          {{ text.centre }}
        </button>
        <button type="button" appTextButton (click)="fill()">
          {{ text.fill }}
        </button>
      </div>

      <div appDialogActions>
        <button
          appButton
          variant="secondary"
          type="button"
          (click)="cancelled.emit()"
        >
          {{ common.cancel }}
        </button>
        @if (offerOriginal()) {
          <button
            appButton
            variant="secondary"
            type="button"
            (click)="original.emit()"
          >
            {{ text.asIs }}
          </button>
        }
        <button appButton type="button" [disabled]="!size()" (click)="apply()">
          {{ text.apply }}
        </button>
      </div>
    </dialog>
  `,
})
export class ImageFramerDialog {
  protected readonly text = inject(ADMIN_TEXT).imageFramer;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly zoomMin = ZOOM_MIN * 100;
  protected readonly zoomMax = ZOOM_MAX * 100;
  protected readonly fitted = FITTED;

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly picture =
    viewChild.required<ElementRef<HTMLImageElement>>('picture');

  /** An object URL of a new file, or a stored picture's own URL. */
  readonly src = input.required<string>();
  /** Whether the picture may also go up untouched — a new file may, a stored
   * picture already has. */
  readonly offerOriginal = input(true);

  readonly framed = output<Blob>();
  readonly original = output<void>();
  readonly cancelled = output<void>();

  protected readonly frame = signal<Frame>(FITTED);
  /** The picture's own pixels; null until it has loaded. */
  protected readonly size = signal<{ width: number; height: number } | null>(
    null,
  );
  protected readonly box = computed(() => {
    const size = this.size();
    return size
      ? placement(size.width, size.height, this.frame())
      : { left: 0, top: 0, width: 0, height: 0 };
  });
  protected readonly zoomPercent = computed(() =>
    Math.round(this.frame().zoom * 100),
  );

  /** The pointer's last position while dragging. */
  protected dragFrom: { x: number; y: number } | null = null;

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.stage().nativeElement.focus();
    });
  }

  protected onLoad(): void {
    const img = this.picture().nativeElement;
    this.size.set({ width: img.naturalWidth, height: img.naturalHeight });
  }

  protected fill(): void {
    const size = this.size();
    if (size) this.frame.set(filled(size.width, size.height));
  }

  protected setZoom(zoom: number): void {
    this.frame.update((frame) => clampFrame({ ...frame, zoom }));
  }

  private move(dx: number, dy: number): void {
    this.frame.update((frame) =>
      clampFrame({ ...frame, x: frame.x + dx, y: frame.y + dy }),
    );
  }

  protected onPointerDown(event: PointerEvent): void {
    this.stage().nativeElement.setPointerCapture(event.pointerId);
    this.dragFrom = { x: event.clientX, y: event.clientY };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragFrom) return;
    const side = this.stage().nativeElement.clientWidth;
    this.move(
      (event.clientX - this.dragFrom.x) / side,
      (event.clientY - this.dragFrom.y) / side,
    );
    this.dragFrom = { x: event.clientX, y: event.clientY };
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.setZoom(this.frame().zoom * Math.exp(-event.deltaY * 0.001));
  }

  protected onKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.key in moves) {
      this.move(...moves[event.key]);
    } else if (event.key === '+' || event.key === '=') {
      this.setZoom(this.frame().zoom * ZOOM_KEY_FACTOR);
    } else if (event.key === '-') {
      this.setZoom(this.frame().zoom / ZOOM_KEY_FACTOR);
    } else {
      return;
    }
    event.preventDefault();
  }

  protected apply(): void {
    const size = this.size();
    if (!size) return;
    const side = outputSide(
      size.width,
      size.height,
      this.frame().zoom,
      MEDIA_CATALOG_THUMB_WIDTH,
      MEDIA_CATALOG_FULL_WIDTH,
    );
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, side, side);
    context.imageSmoothingQuality = 'high';
    const box = this.box();
    context.drawImage(
      this.picture().nativeElement,
      box.left * side,
      box.top * side,
      box.width * side,
      box.height * side,
    );
    // JPEG and not WebP: every browser can encode it, and the server stores
    // its own WebP from it anyway.
    canvas.toBlob(
      (blob) => (blob ? this.framed.emit(blob) : this.cancelled.emit()),
      'image/jpeg',
      0.92,
    );
  }
}
