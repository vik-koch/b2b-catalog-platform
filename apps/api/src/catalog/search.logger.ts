import { Injectable, Logger } from '@nestjs/common';

/** What one executed search is worth recording (NFR-OPS-05). */
export interface SearchEvent {
  /** The normalized query — what actually ran, not the raw input. */
  query: string;
  terms: number;
  results: number;
  page: number;
  durationMs: number;
}

/**
 * Search usage as domain events, for the shop owner rather than the operator:
 * what visitors look for, and which of those queries the catalog answers with
 * nothing. Traefik's access log carries the request, but the query string is
 * not among the fields it keeps, and no access log knows how many rows came
 * back — which is the whole point of the zero-result view.
 *
 * One line per executed search (the results page only — suggestions fire per
 * keystroke and would bury the committed queries under their own prefixes):
 *
 *   [Search] q="esspreso machine" terms=2 results=0 page=1 ms=12
 *
 * The query is quoted for the same reason a product name is in `AuditLogger`:
 * it contains spaces, and unquoted it would split the key=value tail. Nothing
 * identifying is recorded — no IP, no session — so this stays a picture of what
 * the catalog is asked for, not of who asked.
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
