import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  linkedSignal,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { debounced } from './debounced';

/** The wording every suggesting field needs, whatever it suggests. */
export interface SuggestListText {
  readonly suggestionsLabel: string;
  readonly noSuggestions: string;
  /** `{count}` is substituted, for the live region. */
  readonly suggestionCount: string;
}

/**
 * The dropdown itself, shared by every suggesting field so two panels are one
 * panel. Anchored under the field and at least as wide as it, and — where the
 * field shares its row with another, as the street does with what is inside
 * the building — wider than the field, since an address truncated to half a
 * row is a row nobody can choose between.
 *
 * `100cqw` is what keeps that from being wider than the form: each field's
 * width floor is spelled `min(<the width the rows want>, 100cqw)`, so the
 * panel spills into the column beside it where there is one and stops at the
 * form's own edge where there is not. It measures the form rather than the
 * window because a form is not the width of the page — the checkout draws two
 * of these in cards — and the containing form declares the container.
 */
export const SUGGEST_PANEL =
  'absolute top-full left-0 z-20 mt-1 w-full overflow-hidden rounded-md border border-border-strong bg-white py-1 shadow-lg';

/**
 * Long enough that a fast typist produces one call per word — and every call
 * behind one of these is a metered one at a provider, not a query against our
 * own index.
 */
const DEBOUNCE_MS = 300;

/**
 * The behaviour every type-ahead field shares: when to ask, what to show while
 * the next answer is in flight, which row is active, and when the panel is
 * open. Held apart from any one field because the address and the company
 * fields need all of it and agree on none of it by accident — the keyboard
 * handling and the failure behaviour especially, which are the parts that get
 * quietly wrong in a copy.
 *
 * Construct it as a component field, so it runs in an injection context.
 */
export class SuggestList<T> {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Whether the customer is composing, as opposed to looking at a value that is
   * already filled in. Only typing opens the list: a form seeded from a saved
   * value must not cover itself with suggestions for what it already says.
   */
  readonly typing = signal(false);
  readonly activeIndex = signal(-1);

  /**
   * What has been typed, tracked here rather than read off the control: a
   * FormControl's value is not a signal, and `debounced` samples its source the
   * moment it is created — which is before a required input has a value.
   */
  private readonly typed = signal('');
  /**
   * The settled query — public so a field can highlight its rows against the
   * query they answered, rather than against later keystrokes.
   */
  readonly query = debounced(this.typed, DEBOUNCE_MS);

  private readonly suggested = resource({
    params: () => {
      const q = this.query().trim();
      return this.isBrowser &&
        this.typing() &&
        q.length >= this.options.minLength
        ? { q, dependency: this.options.dependsOn?.() }
        : undefined;
    },
    loader: ({ params }) => this.options.load(params.q),
  });

  /**
   * The rows on screen. A loading `resource` reports no value, and rendering
   * that directly makes the panel blink on every keystroke — the previous
   * answer is a better placeholder for the next one than nothing is.
   *
   * A *failed* request is not an answer of "nothing", and `value()` rethrows in
   * the error state, so neither it nor the panel below ever sees one.
   */
  readonly suggestions = linkedSignal<T[] | undefined, T[]>({
    source: () => {
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
  readonly panelOpen = computed(() => this.typing() && this.answered());

  constructor(
    private readonly options: {
      readonly load: (query: string) => Promise<T[]>;
      /** Too short to mean anything is a paid call for nothing. */
      readonly minLength: number;
      /** A signal whose change re-asks — a country to bias by, say. */
      readonly dependsOn?: () => unknown;
    },
  ) {}

  announcement(text: SuggestListText): string {
    if (!this.panelOpen()) return '';
    const count = this.suggestions().length;
    return count === 0
      ? text.noSuggestions
      : text.suggestionCount.replace('{count}', String(count));
  }

  type(value: string): void {
    this.typing.set(true);
    this.typed.set(value);
  }

  /** Returns the row Enter chose, if it chose one. */
  keydown(event: KeyboardEvent): T | undefined {
    if (!this.panelOpen()) return undefined;
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
      return this.suggestions()[this.activeIndex()];
    } else if (event.key === 'Escape') {
      this.close();
    }
    return undefined;
  }

  close(): void {
    this.typing.set(false);
    this.activeIndex.set(-1);
  }
}
