/**
 * Product documents (FR-DOC-01…05): a certificate, declaration or data sheet,
 * as a file, a link to where it is held, or both. Its own record because one
 * file is shown by many products; the links are edited from both sides, here
 * in bulk and from a product's form (FR-DOC-02).
 */

import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_FILE_NAME_MAX_LENGTH,
} from '../../platform/media-constants';
import {
  DOCUMENT_LINK_MAX_LENGTH,
  DOCUMENT_PRODUCTS_MAX,
  DOCUMENT_TITLE_MAX_LENGTH,
  type DocumentErrorCode,
} from './documents';
import { linkedProductSchema } from './linked-product.contract';

/**
 * A stored file as the upload hands it back and a document row keeps it. The
 * stored name is a content hash, so the uploaded name is what identifies a row
 * whose title is wrong.
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

/** http(s) only, since the storefront renders it as an `href`. Trimmed first:
 * a URL pasted from an address bar often brings a space. */
const documentLinkField = z
  .string()
  .trim()
  .pipe(z.httpUrl().max(DOCUMENT_LINK_MAX_LENGTH));

/**
 * What an admin fills in. The file is uploaded first and referenced here, as a
 * catalog image is. Either the file or the link may be missing, never both
 * (FR-DOC-05). The dates are copied off the document, so only their order is
 * checked.
 */
export const documentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX_LENGTH),
    file: storedDocumentFileSchema.nullable().default(null),
    link: documentLinkField.nullable().default(null),
    issuedAt: z.iso.date().nullable().default(null),
    expiresAt: z.iso.date().nullable().default(null),
    /** The products it is shown on. The whole set: what is sent replaces
     * what is stored. */
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
  .refine((input) => input.file !== null || input.link !== null, {
    error: 'file-or-link-required',
    path: ['file'],
  })
  .refine(
    (input) =>
      !input.issuedAt || !input.expiresAt || input.issuedAt <= input.expiresAt,
    { error: 'expiry-before-issue', path: ['expiresAt'] },
  );
export type DocumentInput = z.infer<typeof documentInputSchema>;

/** A document as a product's form lists it. */
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
    file: storedDocumentFileSchema.nullable(),
    /** Any string: one row refused here would fail the whole list. */
    link: z.string().nullable(),
    issuedAt: z.iso.date().nullable(),
    expiresAt: z.iso.date().nullable(),
    /** Products showing it: the list's link into the grid. */
    productCount: z.number().int().nonnegative(),
    /** Of `productCount`, the ones not on the storefront. */
    unpublishedProductCount: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ProductDocument = z.infer<typeof productDocumentSchema>;

/** One document with its products, which the list leaves out. */
export const documentDetailSchema = productDocumentSchema
  .extend({ products: z.array(linkedProductSchema) })
  .strict();
export type DocumentDetail = z.infer<typeof documentDetailSchema>;

const documentErrors = {
  'document-not-found': { status: 404 },
  /** A slug in `productSlugs` names no product. */
  'document-product-not-found': { status: 404 },
} as const satisfies Record<DocumentErrorCode, { status: number }>;

/** Every route here is admin-only. */
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
