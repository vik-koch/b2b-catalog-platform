import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

/**
 * Whether the browser's first render, the one that claims the server's
 * markup, is done. State the server cannot know (the cart) waits for it, or
 * both branches show at once; Angular renders again in the same tick, so
 * nothing paints in between. True from the start on the server.
 *
 * `interactive` is the other side: whether a control can act on what it is
 * given. False on the server too, so a form rendered there refuses input it
 * would lose when the browser claims it.
 */
@Injectable({ providedIn: 'root' })
export class FirstRender {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly done = signal(!this.browser);
  readonly over = this.done.asReadonly();
  readonly interactive = computed(() => this.browser && this.done());

  constructor() {
    if (!this.done()) afterNextRender(() => this.done.set(true));
  }
}
