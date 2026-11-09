import { readFile } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { PDF_FONT, PdfFontFiles } from '../config/deployment-config';
import { Faces, winAnsi } from './pdf-sheet';

/** The deployment's own faces, embedded and subset, or else Helvetica, which
 * every reader has and which writes the Latin alphabets only. */
@Injectable()
export class PdfFaces {
  /** Read once: the mounted files do not change. */
  private files: Promise<{ regular: Buffer; bold: Buffer }> | undefined;

  constructor(
    @Inject(PDF_FONT) private readonly font: PdfFontFiles | undefined,
  ) {}

  /** The faces, and the guard a standard face needs on every string drawn. */
  async embed(
    pdf: PDFDocument,
  ): Promise<{ faces: Faces; encode: ((text: string) => string) | null }> {
    if (!this.font) {
      return {
        faces: {
          regular: await pdf.embedFont(StandardFonts.Helvetica),
          bold: await pdf.embedFont(StandardFonts.HelveticaBold),
        },
        encode: winAnsi,
      };
    }
    pdf.registerFontkit(fontkit);
    const bytes = await this.read(this.font);
    return {
      faces: {
        // Only the glyphs used: the file is mailed and kept.
        regular: await pdf.embedFont(bytes.regular, { subset: true }),
        bold: await pdf.embedFont(bytes.bold, { subset: true }),
      },
      encode: null,
    };
  }

  private read(
    files: PdfFontFiles,
  ): Promise<{ regular: Buffer; bold: Buffer }> {
    return (this.files ??= Promise.all([
      readFile(files.regular),
      readFile(files.bold),
    ]).then(([regular, bold]) => ({ regular, bold })));
  }
}
