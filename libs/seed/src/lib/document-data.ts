/**
 * The demo shop's documents (FR-DOC-01). Titles are the seed's identity here —
 * a document has no sync key, and the demo's own rows are the ones it owns.
 *
 * `expiresInDays` is counted from the seed run rather than fixed, so a demo
 * that has been up for a year still shows a current certificate.
 */
export interface DocumentSeed {
  title: string;
  fileName: string;
  /** The lines printed under the title in the generated placeholder file. */
  body: string[];
  issuedDaysAgo: number | null;
  expiresInDays: number | null;
}

export const documentSeeds: DocumentSeed[] = [
  {
    title: 'Certificate of analysis',
    fileName: 'certificate-of-analysis.pdf',
    body: [
      'Placeholder document for the demo shop.',
      'A real deployment uploads the certificate issued by its laboratory.',
    ],
    issuedDaysAgo: 60,
    expiresInDays: 300,
  },
  {
    title: 'Organic certification',
    fileName: 'organic-certification.pdf',
    body: [
      'Placeholder document for the demo shop.',
      'Certifications are renewed by replacing the file on this document.',
    ],
    issuedDaysAgo: 400,
    expiresInDays: 20,
  },
  {
    title: 'Product data sheet',
    fileName: 'product-data-sheet.pdf',
    body: [
      'Placeholder document for the demo shop.',
      'A data sheet has no expiry date, so it is always current.',
    ],
    issuedDaysAgo: null,
    expiresInDays: null,
  },
];
