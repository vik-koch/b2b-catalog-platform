/**
 * The demo shop's documents (FR-DOC-01). Titles are the seed's identity here —
 * a document has no sync key, and the demo's own rows are the ones it owns.
 *
 * `expiresInDays` is counted from the seed run rather than fixed, so a demo
 * that has been up for a year still shows a current certificate.
 */
export interface DocumentSeed {
  title: string;
  /** The generated placeholder file, absent for a link-only document. */
  file?: {
    fileName: string;
    /** The lines printed under the title in the placeholder. */
    body: string[];
  };
  /** Where the document is held outside the shop (FR-DOC-05). */
  link?: string;
  issuedDaysAgo: number | null;
  expiresInDays: number | null;
  /** Products this document is shown on, named by category rather than one by
   * one: a certificate covers a range, which is also what makes the demo's
   * product count worth looking at. */
  categorySlugs?: string[];
  /** Individual products, where the document is about exactly those. */
  productSlugs?: string[];
}

export const documentSeeds: DocumentSeed[] = [
  {
    title: 'Certificate of analysis',
    file: {
      fileName: 'certificate-of-analysis.pdf',
      body: [
        'Placeholder document for the demo shop.',
        'A real deployment uploads the certificate issued by its laboratory.',
      ],
    },
    issuedDaysAgo: 60,
    expiresInDays: 300,
    categorySlugs: ['espresso'],
  },
  {
    // A file and the register entry it can be checked against.
    title: 'Organic certification',
    file: {
      fileName: 'organic-certification.pdf',
      body: [
        'Placeholder document for the demo shop.',
        'Certifications are renewed by replacing the file on this document.',
      ],
    },
    link: 'https://example.org/register/organic/DE-0000-0001',
    issuedDaysAgo: 400,
    expiresInDays: 20,
    categorySlugs: ['filter', 'single-origin'],
  },
  {
    // The expired state, and the one product pages are silent about: a lapsed
    // document is work for the admin and is not listed to a customer
    // (FR-DOC-03/04), so the demo needs one to show either half.
    title: 'Import declaration',
    file: {
      fileName: 'import-declaration.pdf',
      body: [
        'Placeholder document for the demo shop.',
        'This one has lapsed: the shop shows it to nobody until it is replaced.',
      ],
    },
    issuedDaysAgo: 400,
    expiresInDays: -15,
    categorySlugs: ['espresso'],
  },
  {
    title: 'Product data sheet',
    file: {
      fileName: 'product-data-sheet.pdf',
      body: [
        'Placeholder document for the demo shop.',
        'A data sheet has no expiry date, so it is always current.',
      ],
    },
    issuedDaysAgo: null,
    expiresInDays: null,
    productSlugs: ['takeaway-cup-300', 'takeaway-lid-flat'],
  },
  {
    // Link only: the register entry is the document, and no file was ever
    // handed over.
    title: 'Declaration of conformity',
    link: 'https://example.org/register/conformity/0000-0002',
    issuedDaysAgo: 120,
    expiresInDays: 900,
    productSlugs: ['takeaway-cup-300', 'takeaway-lid-flat'],
  },
];
