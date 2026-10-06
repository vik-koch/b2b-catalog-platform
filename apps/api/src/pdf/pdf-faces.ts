import { Inject, Injectable } from '@nestjs/common';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PDF_FONT, PdfFontFiles } from '../config/deployment-config';
import { Faces, winAnsi } from './pdf-sheet';

/**
 * The two faces every document the API draws is set in.
 *
 * A deployment that names its own gets it embedded and subset — TrueType or
 * OpenType, never the `woff2` the browser is served (ADR 0052). One that
 * names none gets Helvetica, which every reader already has: it needs no
 * file, no licence and no megabyte in the image, and it covers the Latin
 * alphabets with their accents and umlauts. It cannot write anything else,
 * which is what `branding.font.pdf` is for — see config/README.md.
 */
@Injectable()
export class PdfFaces {
  /** Read once per process: the files are immutable for the container's
   * life. */
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
        // Subset, so a document embeds the glyphs it uses rather than a face
        // covering half of Unicode: the file is mailed and kept.
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
