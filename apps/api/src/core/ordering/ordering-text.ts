import {
  ORDERING_AREA,
  type SharedOrderingText,
} from '@b2b-catalog-platform/shared/core/ordering';
import type { SharedText } from '@b2b-catalog-platform/shared/platform';
import { sharedTextBlock } from '../../platform/config/shared-text';
import { type PdfText, pdfTextBlock } from '../../platform/pdf/pdf-text';
import type { OrderingPdfText } from './ordering-pdf-text';

/** Ordering's block of the shared text, checked with the whole file at boot. */
export function sharedOrderingText(common: SharedText): SharedOrderingText {
  return sharedTextBlock<SharedOrderingText>(common, ORDERING_AREA);
}

/** Ordering's block of the PDF text, likewise. */
export function orderingPdf(text: PdfText): OrderingPdfText {
  return pdfTextBlock<OrderingPdfText>(text, ORDERING_AREA);
}
