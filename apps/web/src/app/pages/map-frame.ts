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
        class="aspect-video w-full rounded-lg border border-border"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    } @else {
      <div
        class="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-lg border border-border bg-stone-100 p-6 text-center text-sm text-subtle"
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
