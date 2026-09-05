import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_FILE_NAME_MAX_LENGTH,
  DOCUMENT_PRODUCTS_MAX,
  DOCUMENT_TITLE_MAX_LENGTH,
} from './document-constants';

/**
 * Product documents (FR-DOC-01…04), admin side.
 *
 * A document is a file staff already have — a certificate, a declaration, a
 * data sheet — with a title to find it by and the dates that say whether it is
 * still current. It is its own record rather than a field on a product because
 * one file is shown by many products. The links are edited from both sides —
 * here in bulk, a certificate onto thirty products at once, and one at a time
 * from a product's own form (FR-DOC-02) — because they are one table read from
 * two directions, exactly like product pairings.
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
    /**
     * The products this document is shown on, by slug — the handle the admin
     * API addresses a product by everywhere else.
     *
     * The whole set, like a product's tier prices: what is sent replaces what
     * is stored. An unknown slug is a 404 naming the product rather than a
     * foreign-key error.
     */
    productSlugs: z
      .array(z.string())
      .max(DOCUMENT_PRODUCTS_MAX)
      .refine(
        (slugs) => new Set(slugs).size === slugs.length,
        'A product can only be linked once',
      )
      .default([]),
  })
  .strict()
  .refine(
    (input) =>
      !input.issuedAt || !input.expiresAt || input.issuedAt <= input.expiresAt,
    { error: 'expiry-before-issue', path: ['expiresAt'] },
  );
export type DocumentInput = z.infer<typeof documentInputSchema>;

/**
 * A product a document is shown on, as the editor lists it. The two markers
 * are the pairings editor's, for the same reason: a link outlives a soft
 * delete and an unpublished product is usually one still being prepared, so
 * both are listed marked rather than quietly dropped.
 */
export const documentProductSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    deleted: z.boolean(),
    unpublished: z.boolean(),
  })
  .strict();
export type DocumentProduct = z.infer<typeof documentProductSchema>;

/**
 * A document as a product carries it: what to call it, when it runs out, and
 * the id its own editor is reached by. Deliberately small — the product form
 * lists documents, it does not show them.
 */
export const linkedDocumentSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    expiresAt: z.iso.date().nullable(),
  })
  .strict();
export type LinkedDocument = z.infer<typeof linkedDocumentSchema>;

/** A document as the admin list sees it. */
export const productDocumentSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    file: storedDocumentFileSchema,
    issuedAt: z.iso.date().nullable(),
    expiresAt: z.iso.date().nullable(),
    /** How many products show this document — the list's link into the
     * product grid, narrowed to exactly those rows. */
    productCount: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ProductDocument = z.infer<typeof productDocumentSchema>;

/**
 * One document with the products it is linked to. The list deliberately does
 * not carry them — a few dozen documents naming a few hundred products between
 * them is a payload nobody on that screen reads.
 */
export const documentDetailSchema = productDocumentSchema
  .extend({ products: z.array(documentProductSchema) })
  .strict();
export type DocumentDetail = z.infer<typeof documentDetailSchema>;

/**
 * The one refusal this surface has. There is no delete guard: a document holds
 * no data anything else depends on, and deleting it is how an admin clears a
 * row that should never have been uploaded.
 */
export const DOCUMENT_ERROR_CODES = [
  'document-not-found',
  'document-product-not-found',
] as const;
export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];

const documentErrors = {
  'document-not-found': { status: 404 },
  /** A slug in `productSlugs` names no product. */
  'document-product-not-found': { status: 404 },
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
    .errors({ 'document-not-found': documentErrors['document-not-found'] })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(documentDetailSchema),

  createDocument: admin
    .route({
      method: 'POST',
      path: '/admin/documents',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Create a document from an uploaded file (admin)',
    })
    .errors({
      'document-product-not-found':
        documentErrors['document-product-not-found'],
    })
    .input(z.object({ body: documentInputSchema }))
    .output(documentDetailSchema),

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
    .output(documentDetailSchema),

  deleteDocument: admin
    .route({
      method: 'DELETE',
      path: '/admin/documents/{id}',
      inputStructure: 'detailed',
      summary: 'Delete a document (admin)',
    })
    .errors({ 'document-not-found': documentErrors['document-not-found'] })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ message: z.string() })),
};
