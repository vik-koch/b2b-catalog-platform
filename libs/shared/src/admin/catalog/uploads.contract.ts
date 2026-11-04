import * as z from 'zod';
import { catalogImageSchema } from '../../core/catalog/catalog.contract';
import { storedDocumentFileSchema } from './documents.contract';

/** A stored `{ full, thumb }` pair, ready for a product's gallery. */
export const uploadCatalogImageResponseSchema = catalogImageSchema;
export type UploadCatalogImageResponse = z.infer<
  typeof uploadCatalogImageResponseSchema
>;

/** The whole stored file: its stored name is a content hash, so the original
 * name, type and size are what make it recognisable in the form. */
export const uploadDocumentResponseSchema = storedDocumentFileSchema;
export type UploadDocumentResponse = z.infer<
  typeof uploadDocumentResponseSchema
>;
