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
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { DialogActions } from '@b2b-catalog-platform/ui/overlay/dialog-actions';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { HintBadge } from '@b2b-catalog-platform/ui/content/hint-badge';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { AttributeHint } from './attribute-hints';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';

/**
 * The names the catalog already uses (FR-ATTR-09), one empty row appended per
 * ticked name, so "Length" and "Lenght" never start as two attributes. A
 * dialog: inside the `contenteditable` grid the next paste would destroy it.
 * Names already in the table are disabled, not dropped, which would read as
 * unknown.
 */
@Component({
  selector: 'app-attribute-key-picker',
  imports: [Icon, Button, Checkbox, DialogActions, DialogPanel, HintBadge],
  template: `
    <dialog
      #dialog
      uiDialogPanel
      size="lg"
      aria-labelledby="attribute-key-picker-heading"
      (cancel)="closed.emit()"
    >
      <h2
        id="attribute-key-picker-heading"
        class="text-xl font-normal tracking-tight"
      >
        {{ text.addKeys }}
      </h2>
      <p class="mt-2 text-xs text-ink-subtle">{{ text.addKeysHint }}</p>
      @if (hints().length === 0) {
        <p class="mt-3 text-sm text-ink-subtle">{{ text.addKeysEmpty }}</p>
      } @else {
        <!-- Padding here keeps the counts off a long list's scrollbar. -->
        <ul class="mt-3 max-h-80 overflow-y-auto pr-2">
          @for (hint of hints(); track hint.key) {
            <li>
              <label
                class="flex cursor-pointer items-center gap-2 py-1 text-sm
                       has-[input:disabled]:cursor-not-allowed"
                [class.text-ink-subtle]="used().includes(hint.key)"
              >
                <input
                  type="checkbox"
                  uiCheckbox
                  [checked]="picked().includes(hint.key)"
                  [disabled]="used().includes(hint.key)"
                  (change)="select(hint.key, $any($event.target).checked)"
                />
                <span>{{ hint.key }}</span>
                @if (hint.type) {
                  <ui-hint-badge tone="neutral" [label]="text.filterable">
                    <ui-icon [glyph]="funnelIcon" class="size-3.5" />
                  </ui-hint-badge>
                }
                <span class="ml-auto pl-3 text-xs text-ink-subtle">
                  @if (used().includes(hint.key)) {
                    {{ text.inTable }}
                  } @else {
                    {{ productsLabel(hint.productCount) }}
                  }
                </span>
              </label>
            </li>
          }
        </ul>
      }

      <div uiDialogActions>
        <button
          uiButton
          variant="secondary"
          type="button"
          (click)="closed.emit()"
        >
          {{ actionText.cancel }}
        </button>
        <button
          uiButton
          type="button"
          class="gap-2"
          [disabled]="picked().length === 0"
          (click)="apply()"
        >
          <ui-icon [glyph]="plusIcon" class="size-4" />
          {{ applyLabel() }}
        </button>
      </div>
    </dialog>
  `,
})
export class AttributeKeyPicker {
  protected readonly funnelIcon = funnelIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.attributes;
  private readonly productsText = inject(ADMIN_TEXT).products;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  /** Declared or freetext, alphabetically. */
  readonly hints = input.required<readonly AttributeHint[]>();
  /** Names the grid already holds: offered, but not twice. */
  readonly used = input<readonly string[]>([]);

  /** In the order the grid appends them. */
  readonly add = output<string[]>();
  /** Cancelled or dismissed; the host removes the dialog. */
  readonly closed = output<void>();

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly checked = signal<string[]>([]);

  constructor() {
    // showModal() for the focus trap and backdrop; the host removes this
    // component to close it, and a removed dialog is closed.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  /** A name already in the grid is neither counted nor added again. */
  protected readonly picked = computed(() =>
    this.checked().filter((key) => !this.used().includes(key)),
  );

  protected readonly applyLabel = computed(() =>
    fillText(this.text.addKeysApply, { count: this.picked().length }),
  );

  protected select(key: string, checked: boolean): void {
    this.checked.update((keys) =>
      checked ? [...keys, key] : keys.filter((k) => k !== key),
    );
  }

  protected apply(): void {
    const keys = this.picked();
    if (keys.length === 0) return;
    this.add.emit(keys);
  }

  protected productsLabel(count: number): string {
    return fillText(this.productsText.count, { count });
  }
}
