import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { APP_TEXT } from '../config/app-text';
import { MapEmbed } from '../config/deployment-config.type';
import { ConsentService } from '../consent/consent.service';
import { Button } from '../ui/button';

/**
 * Renders a map as an iframe — the single place map embeds are created.
 * A cookie-setting embed (map.consentRequired) shows a placeholder until
 * consent allows it; no-cookie embeds render immediately.
 */
@Component({
  selector: 'app-map-frame',
  imports: [Button],
  template: `
    @if (visible()) {
      <iframe
        [src]="safeUrl()"
        [title]="title()"
        class="w-full rounded-lg border border-border"
        [class]="shapeClass()"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    } @else {
      <div
        class="flex w-full flex-col items-center justify-center gap-4 rounded-lg border border-border bg-stone-100 p-6 text-center text-sm text-subtle"
        [class]="shapeClass()"
      >
        <p class="max-w-md">{{ text.consentNotice }}</p>
        <!-- Click-to-load: the visitor who said no to the banner, or never
             answered it, can still choose to see the map. It is the same
             consent, so it is recorded the same way and the banner goes. -->
        @if (text.load; as load) {
          <button appButton variant="secondary" (click)="consent.accept()">
            {{ load }}
          </button>
        }
      </div>
    }
  `,
})
export class MapFrame {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly consent = inject(ConsentService);

  readonly map = input.required<MapEmbed>();
  readonly title = input('Map');
  /** Taller than wide on a phone. For a page with one map: a landscape frame
   * at phone width is a strip too short to read a street in. Not as tall as
   * the screen, so a one-finger drag past it still scrolls the page rather
   * than panning the map. */
  readonly portraitOnPhone = input(false);

  protected readonly shapeClass = computed(() =>
    this.portraitOnPhone() ? 'aspect-[3/4] sm:aspect-video' : 'aspect-video',
  );

  protected readonly text = inject(APP_TEXT).map;

  // URLs are deployment-owned/trusted; the URL-only contract keeps this a
  // resource-URL trust, never script execution.
  protected readonly safeUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.map().url),
  );

  protected readonly visible = computed(
    () => !this.map().consentRequired || this.consent.canUse(),
  );
}
