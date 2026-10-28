import { Pipe, PipeTransform } from '@angular/core';
import { HighlightSegment } from '@b2b-catalog-platform/ui/suggest/highlighted-line';
import { matchSegments } from './match-segments';

/**
 * `[segments]="item.name | matchSegments: query : alternateQuery()"` for
 * HighlightedLine. `query` is the settled one the line answered.
 */
@Pipe({ name: 'matchSegments' })
export class MatchSegmentsPipe implements PipeTransform {
  transform(
    line: string,
    query: string,
    alternate: string | null = null,
  ): HighlightSegment[] {
    return matchSegments(line, query, alternate);
  }
}
