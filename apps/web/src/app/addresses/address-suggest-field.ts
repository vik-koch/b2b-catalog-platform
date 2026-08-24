import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  ADDRESS_LINE_MAX_LENGTH,
  ADDRESS_QUERY_MIN_LENGTH,
  AddressComponents,
  AddressSuggestion,
} from '@b2b-catalog-platform/shared';
import { debounced } from '../core/debounced';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AddressesService } from './addresses.service';

/** Long enough that a fast typist produces one call per word — and every call
 * here is a metered one at a provider, not a query against our own index. */
const SUGGEST_DEBOUNCE_MS = 300;

/** `aria-controls` must name one list, and a form may hold two of these. */
let nextId = 0;

export interface AddressSuggestFieldText {
  readonly suggestionsLabel: string;
  readonly noSuggestions: string;
  /** `{count}` is substituted, for the live region. */
  readonly suggestionCount: string;
}

/**
 * The street field, with suggestions where a deployment configures a provider
 * (FR-CART-11, ADR 0040). An ordinary text input first: typing always works,
 * nothing about the form depends on a suggestion arriving, and a deployment
 * with no adapter gets an empty list and therefore no dropdown.
 *
 * Picking a row emits the provider's **components**, which the form spreads
 * across its own controls — the postal code especially, since the delivery
 * zone is decided from it.
 */
@Component({
  selector: 'app-address-suggest-field',
  imports: [ReactiveFormsModule, FieldLabel, Input],
  // See PhoneField: a custom element is inline by default, and an inline box
  // drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId" appFieldLabel>
      {{ label() }}
      <span class="text-accent" aria-hidden="true">*</span>
    </label>

    <div class="relative">
      <input
        [id]="inputId"
        type="text"
        autocomplete="street-address"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="panelOpen()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeOptionId()"
        [attr.aria-invalid]="invalid() || null"
        [attr.maxlength]="maxLength"
        [formControl]="control()"
        appInput
        class="w-full"
        (input)="type($any($event.target).value)"
        (keydown)="keydown($event)"
        (blur)="close()"
      />

      @if (panelOpen()) {
        <div
          class="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-md border border-border-strong bg-white py-1 shadow-lg"
        >
          @if (suggestions().length === 0) {
            <p class="px-3 py-2 text-sm text-subtle">
              {{ text().noSuggestions }}
            </p>
          }
          <ul
            [id]="listId"
            role="listbox"
            [attr.aria-label]="text().suggestionsLabel"
          >
            @for (item of suggestions(); track $index; let i = $index) {
              <li
                [id]="listId + '-' + i"
                role="option"
                [attr.aria-selected]="i === activeIndex()"
                class="cursor-pointer truncate px-3 py-2 text-sm text-stone-800"
                [class.bg-stone-100]="i === activeIndex()"
                (mouseenter)="activeIndex.set(i)"
                (mousedown)="pick($event, item)"
              >
                {{ item.label }}
              </li>
            }
          </ul>
        </div>
      }
    </div>

    <p aria-live="polite" class="sr-only">{{ announcement() }}</p>
  `,
})
export class AddressSuggestField {
  private readonly addresses = inject(AddressesService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly text = input.required<AddressSuggestFieldText>();
  readonly invalid = input(false);
  /** Biases the provider; the form's own country picker feeds it. */
  readonly country = input<string | undefined>(undefined);

  /** The components of the row the customer picked. */
  readonly picked = output<AddressComponents>();

  protected readonly maxLength = ADDRESS_LINE_MAX_LENGTH;
  protected readonly inputId = `address-street-${nextId}`;
  protected readonly listId = `address-suggestions-${nextId++}`;

  /**
   * Whether the customer is composing, as opposed to looking at a value that is
   * already filled in. Only typing opens the list: a form seeded from a saved
   * address must not cover itself with suggestions for what it already says.
   */
  protected readonly typing = signal(false);
  protected readonly activeIndex = signal(-1);

  /**
   * What has been typed, tracked here rather than read off the control: a
   * FormControl's value is not a signal, and `debounced` samples its source the
   * moment it is created — which is before a required input has a value.
   */
  private readonly typed = signal('');
  private readonly query = debounced(this.typed, SUGGEST_DEBOUNCE_MS);

  private readonly suggested = resource({
    params: () => {
      const q = this.query().trim();
      return this.isBrowser &&
        this.typing() &&
        q.length >= ADDRESS_QUERY_MIN_LENGTH
        ? { q, country: this.country() }
        : undefined;
    },
    loader: ({ params }) => this.addresses.suggest(params.q, params.country),
  });

  /**
   * The rows on screen. A loading `resource` reports no value, and rendering
   * that directly makes the panel blink on every keystroke — the previous
   * answer is a better placeholder for the next one than nothing is.
   */
  protected readonly suggestions = linkedSignal<
    AddressSuggestion[] | undefined,
    AddressSuggestion[]
  >({
    source: () => {
      // A failed request is not an answer of "nothing", and `value()` rethrows
      // in the error state — so neither it nor the panel below ever sees one.
      const status = this.suggested.status();
      return status === 'idle' || status === 'error'
        ? []
        : this.suggested.value();
    },
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  /**
   * Up from the first answer until the field is left: anything narrower closes
   * the panel for a beat between two replies. A request that failed never opens
   * it — the API is a network away and the customer is not, so a call that did
   * not arrive is invisible rather than a box saying there is nothing.
   */
  private readonly answered = computed(() => {
    const status = this.suggested.status();
    return (
      status !== 'idle' && status !== 'error' && !this.suggested.isLoading()
    );
  });
  protected readonly panelOpen = computed(
    () => this.typing() && this.answered(),
  );
  protected readonly activeOptionId = computed(() =>
    this.panelOpen() && this.activeIndex() >= 0
      ? `${this.listId}-${this.activeIndex()}`
      : null,
  );
  protected readonly announcement = computed(() => {
    if (!this.panelOpen()) return '';
    const count = this.suggestions().length;
    return count === 0
      ? this.text().noSuggestions
      : this.text().suggestionCount.replace('{count}', String(count));
  });

  protected type(value: string): void {
    this.typing.set(true);
    this.typed.set(value);
  }

  protected keydown(event: KeyboardEvent): void {
    if (!this.panelOpen()) return;
    const last = this.suggestions().length - 1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(
        this.activeIndex() >= last ? -1 : this.activeIndex() + 1,
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(
        this.activeIndex() < 0 ? last : this.activeIndex() - 1,
      );
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      // Only when a row is selected: Enter otherwise belongs to the form.
      event.preventDefault();
      this.apply(this.suggestions()[this.activeIndex()]);
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  /** mousedown, not click: the field's own blur would close the panel first. */
  protected pick(event: MouseEvent, item: AddressSuggestion): void {
    event.preventDefault();
    this.apply(item);
  }

  protected close(): void {
    this.typing.set(false);
    this.activeIndex.set(-1);
  }

  private apply(item: AddressSuggestion): void {
    this.picked.emit(item.components);
    this.close();
  }
}
