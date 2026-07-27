import { Client } from 'pg';
import { MEDIA_URL_PREFIX } from '@b2b-catalog-platform/shared';

// Matches every /media/<filename> occurrence in a stored string. The filename
// charset mirrors the sanitizer's src guard, so extraction and validation can
// never disagree about what a valid reference looks like.
const MEDIA_REFERENCE = new RegExp(
  `${MEDIA_URL_PREFIX}/([A-Za-z0-9._-]+)`,
  'g',
);

/** Every stored media filename referenced by a blob of HTML (or plain text). */
export function mediaFilenamesInHtml(html: string): string[] {
  return [...html.matchAll(MEDIA_REFERENCE)].map((match) => match[1]);
}

/**
 * A place stored content can reference an uploaded media file. The prune sweep
 * (prune-media.ts) treats the union of every source's filenames as "in use" and
 * deletes only files no source references.
 */
export interface MediaReferenceSource {
  readonly name: string;
  collect(client: Client): Promise<string[]>;
}

/**
 * THE registry of media reference sources. This is a safety boundary, not a
 * convenience: a `/media` URL that can be stored but is NOT covered here will be
 * treated as an orphan and DELETED by the sweep. So whenever a new column or
 * entity can hold media (e.g. product rich descriptions or a product image
 * column when the catalog lands), it MUST be added here.
 */
export const MEDIA_REFERENCE_SOURCES: readonly MediaReferenceSource[] = [
  {
    name: 'page bodies',
    async collect(client) {
      const { rows } = await client.query<{ bodyHtml: string }>(
        'SELECT "bodyHtml" FROM pages',
      );
      return rows.flatMap((row) => mediaFilenamesInHtml(row.bodyHtml));
    },
  },
];

/** Union of the filenames every registered source currently references. */
export async function collectReferencedFilenames(
  client: Client,
  sources: readonly MediaReferenceSource[] = MEDIA_REFERENCE_SOURCES,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const source of sources) {
    for (const filename of await source.collect(client)) {
      referenced.add(filename);
    }
  }
  return referenced;
}
