import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { APP_TEXT } from '../config/app-text';
import { MapEmbed } from '../config/deployment-config';
import { ConsentService } from '../consent/consent.service';

/**
 * Renders a map as an iframe — the single place map embeds are created.
 * A cookie-setting embed (map.consentRequired) shows a placeholder until
 * consent allows it; no-cookie embeds render immediately.
 */
@Component({
  selector: 'app-map-frame',
  template: `
    @if (visible()) {
      <iframe
        [src]="safeUrl()"
        [title]="title()"
        class="aspect-video w-full rounded-lg border border-stone-200"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    } @else {
      <div
        class="flex aspect-video w-full items-center justify-center rounded-lg border border-stone-200 bg-stone-100 p-6 text-center text-sm text-stone-500"
      >
        {{ consentNotice }}
      </div>
    }
  `,
})
export class MapFrame {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly consent = inject(ConsentService);

  readonly map = input.required<MapEmbed>();
  readonly title = input('Map');

  protected readonly consentNotice = inject(APP_TEXT).map.consentNotice;

  // URLs are deployment-owned/trusted; the URL-only contract keeps this a
  // resource-URL trust, never script execution.
  protected readonly safeUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.map().url),
  );

  protected readonly visible = computed(
    () => !this.map().consentRequired || this.consent.canUse(),
  );
}
