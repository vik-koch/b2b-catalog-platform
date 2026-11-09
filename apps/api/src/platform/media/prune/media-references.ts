import {
  DOCUMENT_URL_PREFIX,
  MEDIA_URL_PREFIX,
} from '@b2b-catalog-platform/shared/platform';

import { Database } from '../../db/database';

/** The filenames under `prefix` in a stored string, in the charset the
 * sanitizer's src check admits. */
const filenamesUnder = (prefix: string) => {
  const reference = new RegExp(`${prefix}/([A-Za-z0-9._-]+)`, 'g');
  return (text: string): string[] =>
    [...text.matchAll(reference)].map((match) => match[1]);
};

export const mediaFilenamesInHtml = filenamesUnder(MEDIA_URL_PREFIX);

export const documentFilenames = filenamesUnder(DOCUMENT_URL_PREFIX);

/** A place stored content can reference an uploaded file. */
export interface MediaReferenceSource {
  readonly name: string;
  collect(db: Database): Promise<string[]>;
}

/** The sources of each sweep, composed at the root from every area's: the
 * image sources never see a document's row, so documents, in their
 * subdirectory, are swept against their own. */
export interface MediaReferences {
  readonly media: readonly MediaReferenceSource[];
  readonly documents: readonly MediaReferenceSource[];
}

/** Union of the filenames every registered source currently references. */
export async function collectReferencedFilenames(
  db: Database,
  sources: readonly MediaReferenceSource[],
): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const source of sources) {
    for (const filename of await source.collect(db)) {
      referenced.add(filename);
    }
  }
  return referenced;
}
