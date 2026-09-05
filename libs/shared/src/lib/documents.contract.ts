import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_FILE_NAME_MAX_LENGTH,
  DOCUMENT_TITLE_MAX_LENGTH,
} from './document-constants';

/**
 * Product documents (FR-DOC-01…04), admin side.
 *
 * A document is a file staff already have — a certificate, a declaration, a
 * data sheet — with a title to find it by and the dates that say whether it is
 * still current. It is its own record rather than a field on a product because
 * one file is shown by many products; the links themselves are not part of
 * this slice.
 */

export type AcceptedDocumentMime =
  (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number];

/**
 * A stored file, as the upload endpoint hands it back and as a document row
 * keeps it. Everything here but the URL is for the admin's benefit: the stored
 * name is a content hash, so without the name it was uploaded under, a row
 * whose title is wrong is unidentifiable.
 */
export const storedDocumentFileSchema = z
  .object({
    /** Same-origin URL under /documents, e.g. "/documents/9f3ac1b20e4d.pdf". */
    url: z.string(),
    /** The uploaded file's own name. Display only — nothing resolves by it. */
    name: z.string().max(DOCUMENT_FILE_NAME_MAX_LENGTH),
    /** The *sniffed* type, never the one the browser claimed. */
    contentType: z.enum(ACCEPTED_DOCUMENT_MIME_TYPES),
    byteSize: z.number().int().positive(),
  })
  .strict();
export type StoredDocumentFile = z.infer<typeof storedDocumentFileSchema>;

/**
 * What an admin fills in. The file is uploaded first and referenced here, the
 * way a catalog image is: the bytes travel as multipart, the row as JSON.
 *
 * Both dates are optional and independent — a data sheet has neither, and a
 * certificate issued today may carry no expiry at all. Nothing here checks one
 * against the other beyond ordering, because a document's dates are copied off
 * the document, not decided in this form.
 */
export const documentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
    file: storedDocumentFileSchema,
    issuedAt: z.iso.date().nullable().default(null),
    expiresAt: z.iso.date().nullable().default(null),
  })
  .strict()
  .refine(
    (input) =>
      !input.issuedAt || !input.expiresAt || input.issuedAt <= input.expiresAt,
    { error: 'expiry-before-issue', path: ['expiresAt'] },
  );
export type DocumentInput = z.infer<typeof documentInputSchema>;

/** A document as the admin list and editor see it. */
export const productDocumentSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    file: storedDocumentFileSchema,
    issuedAt: z.iso.date().nullable(),
    expiresAt: z.iso.date().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ProductDocument = z.infer<typeof productDocumentSchema>;

/**
 * The one refusal this surface has. There is no delete guard: a document holds
 * no data anything else depends on, and deleting it is how an admin clears a
 * row that should never have been uploaded.
 */
export const DOCUMENT_ERROR_CODES = ['document-not-found'] as const;
export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];

const documentErrors = {
  'document-not-found': { status: 404 },
} as const satisfies Record<DocumentErrorCode, { status: number }>;

/** Every route here is admin-only, like the rest of the catalog write surface. */
const admin = oc.errors(commonAuthErrors);

export const documentsContract = {
  listDocuments: admin
    .route({
      method: 'GET',
      path: '/admin/documents',
      summary: 'List the product documents (admin)',
    })
    .output(z.object({ documents: z.array(productDocumentSchema) }).strict()),

  getDocument: admin
    .route({
      method: 'GET',
      path: '/admin/documents/{id}',
      inputStructure: 'detailed',
      summary: 'Read one document (admin)',
    })
    .errors(documentErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(productDocumentSchema),

  createDocument: admin
    .route({
      method: 'POST',
      path: '/admin/documents',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Create a document from an uploaded file (admin)',
    })
    .input(z.object({ body: documentInputSchema }))
    .output(productDocumentSchema),

  updateDocument: admin
    .route({
      method: 'PUT',
      path: '/admin/documents/{id}',
      inputStructure: 'detailed',
      summary: 'Update a document, file included (admin)',
    })
    .errors(documentErrors)
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: documentInputSchema,
      }),
    )
    .output(productDocumentSchema),

  deleteDocument: admin
    .route({
      method: 'DELETE',
      path: '/admin/documents/{id}',
      inputStructure: 'detailed',
      summary: 'Delete a document (admin)',
    })
    .errors(documentErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ message: z.string() })),
};
