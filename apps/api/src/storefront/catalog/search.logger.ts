import { Injectable, Logger } from '@nestjs/common';

/** What one executed search is worth recording (NFR-OPS-05). */
export interface SearchEvent {
  /** The normalized query: what ran, not the raw input. */
  query: string;
  terms: number;
  results: number;
  page: number;
  durationMs: number;
}

/**
 * What visitors search for and which queries find nothing, for the shop owner:
 * no access log knows how many rows came back. One line per results page, not
 * per suggestion, which would bury the queries under their prefixes:
 *
 *   [Search] q="esspreso machine" terms=2 results=0 page=1 ms=12
 *
 * Nothing identifying is recorded: no IP, no session.
 */
@Injectable()
export class SearchLogger {
  private readonly logger = new Logger('Search');

  record(event: SearchEvent): void {
    this.logger.log(
      `q=${JSON.stringify(event.query)} terms=${event.terms} results=${
        event.results
      } page=${event.page} ms=${event.durationMs}`,
    );
  }
}
