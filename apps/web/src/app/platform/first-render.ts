import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
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
 */
@Injectable({ providedIn: 'root' })
export class FirstRender {
  private readonly done = signal(!isPlatformBrowser(inject(PLATFORM_ID)));
  readonly over = this.done.asReadonly();

  constructor() {
    if (!this.done()) afterNextRender(() => this.done.set(true));
  }
}
