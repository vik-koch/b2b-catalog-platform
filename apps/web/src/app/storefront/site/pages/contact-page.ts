import { Component, inject } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { EmphasisedText } from '@b2b-catalog-platform/ui/content/emphasised-text';
import { PageSectionTitle } from '@b2b-catalog-platform/ui/content/page-section-title';
import { MapFrame } from './map-frame';
import { StaticPage } from './static-page';

/** The editable prose, then the configured offices with their maps. */
@Component({
  selector: 'app-contact-page',
  imports: [StaticPage, MapFrame, EmphasisedText, PageSectionTitle],
  template: `
    <app-static-page slug="contact">
      <ng-template>
        <div class="space-y-10">
          @for (location of locations; track location.name) {
            <section>
              <h2 uiPageSectionTitle>
                {{ location.name }}
              </h2>
              @if (location.description) {
                <p class="mt-1 text-ink-subtle">
                  <ui-emphasised [text]="location.description" />
                </p>
              }
              <app-map-frame
                class="mt-4 block"
                [map]="location.map"
                [title]="location.name + ' map'"
                [portraitOnPhone]="locations.length === 1"
              />
            </section>
          }
        </div>
      </ng-template>
    </app-static-page>
  `,
})
export class ContactPage {
  protected readonly locations = inject(DEPLOYMENT_CONFIG).locations;
}
