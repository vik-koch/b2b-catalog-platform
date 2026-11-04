import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

/**
 * Whether the browser's first render is behind us — the one that claims the
 * server's markup.
 *
 * State the server cannot know (the cart in localStorage) must not reach that
 * render. Where it does, Angular draws a different branch from the one the
 * server sent and keeps the server's until the app is stable, so for a moment
 * both are on screen: an "Added" label stacked on the "Add to cart" it
 * replaces, a card a row taller than its neighbours. Held back until this is
 * true, the first render matches the markup, and the browser's own state
 * arrives in the next one — before anything is painted, since Angular renders
 * again within the same tick when an after-render hook changes a signal.
 *
 * True from the start on the server, which has none of that state to hold.
 */
@Injectable({ providedIn: 'root' })
export class FirstRender {
  private readonly done = signal(!isPlatformBrowser(inject(PLATFORM_ID)));
  readonly over = this.done.asReadonly();

  constructor() {
    if (!this.done()) afterNextRender(() => this.done.set(true));
  }
}
