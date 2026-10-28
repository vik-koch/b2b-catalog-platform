import {
  booleanAttribute,
  Component,
  computed,
  contentChild,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Collapsible } from './collapsible';
import { ShowMoreToggle } from './show-more-toggle';

/**
 * A list showing its first few, the rest opening in place under them. The
 * caller draws each row as an `<li>` in the projected template and owns
 * `open`, so it can hold the list open (a chosen row past the cutoff).
 *
 *   <ui-show-more-list [items]="values" [limit]="8" restId="origin-rest"
 *     [open]="open()" (toggled)="open.set(!open())" [trackBy]="byValue">
 *     <ng-template let-value><li>{{ value.label }}</li></ng-template>
 *   </ui-show-more-list>
 */
@Component({
  selector: 'ui-show-more-list',
  imports: [NgTemplateOutlet, Collapsible, ShowMoreToggle],
  host: { class: 'block' },
  template: `
    <ul [class]="spaced() ? 'space-y-1.5' : ''">
      @for (item of shown(); track trackBy()(item)) {
        <ng-container
          [ngTemplateOutlet]="row()"
          [ngTemplateOutletContext]="{ $implicit: item }"
        />
      }
    </ul>
    @if (rest().length) {
      <ui-collapsible [open]="open()" [id]="restId()">
        <ul [class]="spaced() ? 'space-y-1.5 pt-1.5' : ''">
          @for (item of rest(); track trackBy()(item)) {
            <ng-container
              [ngTemplateOutlet]="row()"
              [ngTemplateOutletContext]="{ $implicit: item }"
            />
          }
        </ul>
      </ui-collapsible>
      <!-- Pulled out by the button's own padding, so its word starts on the
           line the rows do. -->
      <ui-show-more-toggle
        class="mt-1 -ml-3 justify-start"
        [expanded]="open()"
        [controls]="restId()"
        (toggled)="toggled.emit()"
      />
    }
  `,
})
export class ShowMoreList<T> {
  readonly items = input.required<readonly T[]>();
  readonly limit = input.required<number>();
  readonly open = input(false);
  /** The id of the folded rest, which the toggle points at. */
  readonly restId = input.required<string>();
  /** A row's identity, so rows survive a refresh of the items. */
  readonly trackBy = input<(item: T) => unknown>((item) => item);
  /** A gap between rows that do not space themselves. */
  readonly spaced = input(false, { transform: booleanAttribute });

  readonly toggled = output();

  protected readonly row = contentChild.required(TemplateRef);

  protected readonly shown = computed(() =>
    this.items().slice(0, this.limit()),
  );
  protected readonly rest = computed(() => this.items().slice(this.limit()));
}
