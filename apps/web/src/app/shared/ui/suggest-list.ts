import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  linkedSignal,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { debounced } from '@b2b-catalog-platform/ui/core/debounced';

export interface SuggestListText {
  readonly suggestionsAria: string;
  readonly noSuggestions: string;
  /** `{count}` is substituted, for the live region. */
  readonly suggestionCountAria: string;
}

/** One call per word for a fast typist: a call may be a metered one. */
const DEBOUNCE_MS = 300;

/**
 * A type-ahead's state: when to ask, what to show while the next answer is in
 * flight, which row is active and when the panel is open. Construct it as a
 * component field, so it runs in an injection context.
 */
export class SuggestList<T> {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Only typing opens the list: a field seeded from a saved value must not
   * cover itself with suggestions for what it already says. */
  readonly typing = signal(false);
  readonly activeIndex = signal(-1);

  /** Tracked here, not read off the field: `debounced` samples its source on
   * creation, before a required input has a value. */
  private readonly typed = signal('');
  /** The settled query, which the rows answered and are highlighted against. */
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
   * The previous answer stands in while the next loads, or the panel blinks
   * on every keystroke. `value()` rethrows in the error state, so a failed
   * request is read as no answer, never as an empty one.
   */
  private readonly answer = linkedSignal<T[] | undefined, T[]>({
    source: () => {
      const status = this.suggested.status();
      return status === 'idle' || status === 'error'
        ? []
        : this.suggested.value();
    },
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  /** The rows on screen. Keys, active row and count index this list, never
   * the raw answer, or Enter picks a row nobody sees. */
  readonly suggestions = computed(() => {
    const answer = this.answer();
    return this.options.shown ? this.options.shown(answer) : answer;
  });

  /** Open from the first answer until the field is left, or it closes for a
   * beat between two replies. A failed request never opens it: a call that did
   * not arrive is invisible, not a box saying there is nothing. */
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
      readonly minLength: number;
      /** A signal whose change asks again. */
      readonly dependsOn?: () => unknown;
      /** Exclusions and a row cap. */
      readonly shown?: (answer: T[]) => T[];
    },
  ) {}

  announcement(text: SuggestListText): string {
    if (!this.panelOpen()) return '';
    const count = this.suggestions().length;
    return count === 0
      ? text.noSuggestions
      : text.suggestionCountAria.replace('{count}', String(count));
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
    } else if (
      (event.key === 'Home' || event.key === 'End') &&
      this.activeIndex() >= 0
    ) {
      // Only inside the list: while typing they move the caret.
      event.preventDefault();
      this.activeIndex.set(event.key === 'Home' ? 0 : last);
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
