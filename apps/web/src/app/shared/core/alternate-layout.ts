import { inject, Injectable } from '@angular/core';
import { alternateLayoutQuery } from '@b2b-catalog-platform/shared/platform';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

/**
 * A query as it reads on the deployment's second keyboard layout
 * (FR-SEARCH-08) — the same reading the API searches with, so a filter in the
 * browser and the highlight on a server's answer agree with it.
 */
@Injectable({ providedIn: 'root' })
export class AlternateLayout {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly layout = this.config.search?.alternateLayout ?? null;

  /** The other reading, or null where there is none. */
  of(query: string): string | null {
    return alternateLayoutQuery(query, this.layout);
  }

  /** The query, then its other reading where it has one. */
  readings(query: string): string[] {
    const other = this.of(query);
    return other === null ? [query] : [query, other];
  }

  /** A test for texts that hold the query in either reading, ignoring case
   * as the deployment's language does. */
  matches(query: string): (text: string) => boolean {
    const lower = (text: string) => text.toLocaleLowerCase(this.config.locale);
    const readings = this.readings(query.trim()).map(lower);
    return (text) => readings.some((reading) => lower(text).includes(reading));
  }
}
