import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { fillText, MapEmbed } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { ConsentService } from '../../consent/consent.service';
import { Button } from '@b2b-catalog-platform/ui/actions/button';

/** The one place a map embed is created: one that sets cookies waits for
 * consent behind a placeholder. */
@Component({
  selector: 'app-map-frame',
  imports: [Button],
  template: `
    @if (visible()) {
      <iframe
        [src]="safeUrl()"
        [title]="title()"
        class="w-full rounded-lg border border-edge"
        [class]="shapeClass()"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    } @else {
      <div
        class="flex w-full flex-col items-center justify-center gap-4
               rounded-lg border border-edge bg-surface p-6 text-center
               text-sm text-ink-subtle"
        [class]="shapeClass()"
      >
        <p class="max-w-md">{{ notice }}</p>
        <!-- The banner's consent, given here instead. -->
        @if (text.load; as load) {
          <button uiButton variant="secondary" (click)="consent.accept()">
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
  /** For a page with one map: a landscape frame on a phone is too short to
   * read a street in. Short of the screen, so a drag past it still scrolls. */
  readonly portraitOnPhone = input(false);

  protected readonly shapeClass = computed(() =>
    this.portraitOnPhone() ? 'aspect-[3/4] sm:aspect-video' : 'aspect-video',
  );

  protected readonly text = inject(STOREFRONT_TEXT).map;
  protected readonly notice = fillText(this.text.consentNotice, {
    provider: inject(DEPLOYMENT_CONFIG).mapProvider,
  });

  // Deployment-owned, and a URL only: trusted as a resource, never as script.
  protected readonly safeUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.map().url),
  );

  protected readonly visible = computed(
    () => !this.map().consentRequired || this.consent.canUse(),
  );
}
