import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { MapFrame } from './map-frame';

/**
 * Contact page — a code page (not a CMS Page): editable prose could join later,
 * but the office list + map embeds are structured deployment config, rendered
 * as a list so multi-location deployments need no change. Maps render through
 * MapFrame, which owns the iframe-only + consent rules.
 */
@Component({
  selector: 'app-contact-page',
  imports: [MapFrame],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">{{ heading }}</h1>
    <p class="mb-8 text-stone-600">{{ text.intro }}</p>

    <div class="space-y-10">
      @for (location of locations; track location.name) {
        <section>
          <h2 class="text-xl font-semibold">{{ location.name }}</h2>
          @if (location.description) {
            <p class="mt-1 text-stone-600">{{ location.description }}</p>
          }
          <app-map-frame
            class="mt-4 block"
            [map]="location.map"
            [title]="location.name + ' map'"
          />
        </section>
      }
    </div>
  `,
})
export class ContactPage {
  private readonly appText = inject(APP_TEXT);

  protected readonly heading = this.appText.nav['contact'];
  protected readonly text = this.appText.contact;
  protected readonly locations = inject(DEPLOYMENT_CONFIG).locations;
}
