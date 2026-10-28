import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  contentChild,
  input,
  output,
} from '@angular/core';
import { SuggestList, SuggestListText } from './suggest-list';
import { SuggestRow } from './suggest-row';

/** `aria-controls` must name one list, and a form may hold several. */
let nextId = 0;

const panel = `absolute top-full left-0 z-20 mt-1 w-full overflow-hidden
               rounded-md border border-edge-strong bg-white py-1 shadow-lg`;

/**
 * A floor wider than a field that shares its row. `100cqw` stops it at the
 * form's edge, so the form must declare itself a `@container`.
 */
const widths = {
  /** As wide as the field. */
  field: '',
  /** A name with a short line under it. */
  md: 'min-w-[min(20rem,100cqw)]',
  /** A street, a postcode and a town on one line. */
  lg: 'min-w-[min(26rem,100cqw)]',
} as const;

/**
 * A type-ahead combobox (APG, list autocomplete) around the caller's input.
 * The caller owns the value and the SuggestList. No row is active until an
 * arrow key, so Enter submits the form until then.
 *
 *   <app-suggest-field [list]="list" [text]="text" (picked)="apply($event)">
 *     <input appInput appSuggestInput class="w-full" [formField]="field()" />
 *     <ng-template appSuggestRow [of]="list" let-item let-query="query">
 *       <app-highlighted-line [line]="item.name" [query]="query" />
 *     </ng-template>
 *   </app-suggest-field>
 */
@Component({
  selector: 'app-suggest-field',
  imports: [NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <div class="relative">
      <ng-content />

      @if (list().panelOpen()) {
        <div [class]="panel()">
          @if (list().suggestions().length === 0) {
            <p class="px-3 py-2 text-sm text-ink-subtle">
              {{ text().noSuggestions }}
            </p>
          }
          <ul
            [id]="listId"
            role="listbox"
            [attr.aria-label]="text().suggestionsAria"
          >
            @for (item of list().suggestions(); track $index; let i = $index) {
              <li
                [id]="listId + '-' + i"
                role="option"
                [attr.aria-selected]="i === list().activeIndex()"
                class="cursor-pointer px-3 py-2 text-sm"
                [class.bg-surface-subtle-hover]="i === list().activeIndex()"
                (mouseenter)="list().activeIndex.set(i)"
                (mousedown)="choose($event, item)"
              >
                <ng-container
                  [ngTemplateOutlet]="row().template"
                  [ngTemplateOutletContext]="{
                    $implicit: item,
                    query: list().query(),
                  }"
                />
              </li>
            }
          </ul>
        </div>
      }
    </div>

    <p aria-live="polite" class="sr-only">{{ list().announcement(text()) }}</p>
  `,
})
export class SuggestField<T> {
  readonly list = input.required<SuggestList<T>>();
  readonly text = input.required<SuggestListText>();
  readonly width = input<keyof typeof widths>('field');

  readonly picked = output<T>();

  protected readonly row = contentChild.required(SuggestRow<T>);

  readonly listId = `suggestions-${nextId++}`;

  protected readonly panel = computed(() => `${panel} ${widths[this.width()]}`);

  readonly activeOptionId = computed(() =>
    this.list().panelOpen() && this.list().activeIndex() >= 0
      ? `${this.listId}-${this.list().activeIndex()}`
      : null,
  );

  keydown(event: KeyboardEvent): void {
    const chosen = this.list().keydown(event);
    if (chosen) this.pick(chosen);
  }

  /** mousedown, not click: the input's blur would close the panel first. */
  protected choose(event: MouseEvent, item: T): void {
    event.preventDefault();
    this.pick(item);
  }

  private pick(item: T): void {
    this.picked.emit(item);
    this.list().close();
  }
}
