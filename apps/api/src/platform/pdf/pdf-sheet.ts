import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from 'pdf-lib';

/** A4, in PDF points. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;
/** Space between two fields of the top block. Wide enough that a two-line
 * address and the field under it are plainly two answers. */
const FIELD_GAP = 6;

/** The two faces the layout uses, embedded once per document. */
export interface Faces {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

/** A stretch of running text in one weight, or a forced line break. */
export type TextRun = { text: string; bold?: boolean } | { break: true };

/** One word as drawn: a word can change weight midway, as in `<b>4</b>kg`. */
type Word = { text: string; font: PDFFont }[];

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.85, 0.85, 0.85);

/**
 * A page being written down, top to bottom.
 *
 * Deliberately small: pdf-lib draws text at a coordinate and nothing else, so
 * what a layout needs is a cursor, wrapping, and a rule for when to start a new
 * page. Anything richer would be a layout engine, which is what ADR 0052 chose
 * a library over a browser to avoid.
 */
export class Sheet {
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;
  private readonly width = PAGE_WIDTH - MARGIN * 2;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly faces: Faces,
    /** Applied to every string before it is drawn, where the face cannot
     * write everything: a standard face throws on a character it has no
     * encoding for, and one product name must not cost the whole document. */
    private readonly encode: ((text: string) => string) | null,
  ) {
    this.page = this.newPage();
  }

  /** One place where text meets the page, so the encoding guard cannot be
   * forgotten at a call site. */
  private write(
    text: string,
    options: Parameters<PDFPage['drawText']>[1],
  ): void {
    this.page.drawText(this.plain(text), options);
  }

  /** Measured on the same string that will be drawn — a character replaced
   * after it was measured puts every column out. */
  private widthOf(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(this.plain(text), size);
  }

  /** Every string entering the page passes through here first, so wrapping
   * measures exactly what will be drawn. */
  private plain(text: string): string {
    return this.encode ? this.encode(text) : text;
  }

  heading(text: string, size: number): void {
    this.draw(text, { size, font: this.faces.bold, height: size + 6 });
  }

  gap(points: number): void {
    this.y -= points;
  }

  /** A label and its value, as one row: the label on the left in muted small
   * caps-height text, the value wrapped in the column beside it. */
  field(label: string, value: string | string[]): void {
    const values = (Array.isArray(value) ? value : [value])
      .filter(Boolean)
      .map((entry) => this.plain(entry));
    if (values.length === 0) return;
    const labelWidth = 130;
    const wrapped = values.flatMap((entry) =>
      entry
        .split('\n')
        .flatMap((line) =>
          wrap(line, this.faces.regular, BODY_SIZE, this.width - labelWidth),
        ),
    );
    this.ensure(wrapped.length * LINE_HEIGHT + FIELD_GAP);
    const top = this.y;
    this.write(label, {
      x: MARGIN,
      y: top,
      size: BODY_SIZE,
      font: this.faces.regular,
      color: MUTED,
    });
    wrapped.forEach((line, index) => {
      this.write(line, {
        x: MARGIN + labelWidth,
        y: top - index * LINE_HEIGHT,
        size: BODY_SIZE,
        font: this.faces.regular,
        color: INK,
      });
    });
    // A gap between fields, not only between the lines inside one: the block
    // is a list of answers to different questions, and set solid it reads as
    // one paragraph of them.
    this.y = top - wrapped.length * LINE_HEIGHT - FIELD_GAP;
  }

  /**
   * The lines. Three columns — what it was, how much of it, what it came to —
   * with the two numeric ones right-aligned, because a column of figures is
   * read by comparing them.
   */
  table(headings: string[], rows: string[][]): void {
    // caller's array is a literal built for this call.
    const columns = [this.width - 200, 110, 90];
    const x = [MARGIN, MARGIN + columns[0], MARGIN + columns[0] + columns[1]];
    this.ensure(LINE_HEIGHT * 2);
    headings = headings.map((heading) => this.plain(heading));
    headings.forEach((heading, index) => {
      const width = this.widthOf(heading, this.faces.bold, BODY_SIZE);
      this.write(heading, {
        // The first column reads left to right; the other two end where the
        // figures under them end.
        x: index === 0 ? x[index] : x[index] + columns[index] - width,
        y: this.y,
        size: BODY_SIZE,
        font: this.faces.bold,
        color: INK,
      });
    });
    // Clear of the headings' descenders before the rule is drawn: a line at
    // the baseline strikes the words through.
    this.y -= 14;
    this.rule();

    for (const row of rows.map((row) => row.map((cell) => this.plain(cell)))) {
      const cells = row[0]
        .split('\n')
        .flatMap((line) =>
          wrap(line, this.faces.regular, BODY_SIZE, columns[0] - 12),
        );
      this.ensure(cells.length * LINE_HEIGHT + 6);
      const top = this.y;
      cells.forEach((line, index) => {
        this.write(line, {
          x: x[0],
          y: top - index * LINE_HEIGHT,
          size: BODY_SIZE,
          font: this.faces.regular,
          color: index === 0 ? INK : MUTED,
        });
      });
      row.slice(1).forEach((cell, index) => {
        const column = index + 1;
        const width = this.widthOf(cell, this.faces.regular, BODY_SIZE);
        this.write(cell, {
          x: x[column] + columns[column] - width,
          y: top,
          size: BODY_SIZE,
          font: this.faces.regular,
          color: INK,
        });
      });
      this.y = top - cells.length * LINE_HEIGHT - 4;
      this.rule();
    }
  }

  /** Running text across the full width. */
  paragraph(text: string): void {
    const lines = this.plain(text)
      .split('\n')
      .flatMap((line) => wrap(line, this.faces.regular, BODY_SIZE, this.width));
    for (const line of lines) {
      this.draw(line, {
        size: BODY_SIZE,
        font: this.faces.regular,
        height: LINE_HEIGHT,
      });
    }
  }

  /** The bold total line, and under its figure, in small print, what that
   * figure includes. */
  total(label: string, value: string, note?: string): void {
    this.ensure(LINE_HEIGHT * (note ? 3 : 2));
    this.y -= 4;
    const width = this.widthOf(value, this.faces.bold, BODY_SIZE + 1);
    this.write(label, {
      x: MARGIN,
      y: this.y,
      size: BODY_SIZE + 1,
      font: this.faces.bold,
      color: INK,
    });
    this.write(value, {
      x: PAGE_WIDTH - MARGIN - width,
      y: this.y,
      size: BODY_SIZE + 1,
      font: this.faces.bold,
      color: INK,
    });
    this.y -= LINE_HEIGHT;
    if (note) {
      const plain = this.plain(note);
      const size = BODY_SIZE - 1;
      this.write(plain, {
        x: PAGE_WIDTH - MARGIN - this.widthOf(plain, this.faces.regular, size),
        y: this.y + 3,
        size,
        font: this.faces.regular,
        color: MUTED,
      });
      this.y -= LINE_HEIGHT;
    }
  }

  /** Written on every page as it is finished, so a page that was started by an
   * overflowing table carries it too. */
  footer(text: string): void {
    for (const page of this.pdf.getPages()) {
      page.drawText(this.plain(text), {
        x: MARGIN,
        y: MARGIN - 20,
        size: 8,
        font: this.faces.regular,
        color: MUTED,
      });
    }
  }

  /**
   * Running text whose words may differ in weight, wrapped across the width
   * less `indent`. A `marker` — a bullet, a number — hangs in the indent beside
   * the first line.
   */
  runs(
    runs: readonly TextRun[],
    options: {
      size?: number;
      indent?: number;
      marker?: string;
      muted?: boolean;
    } = {},
  ): void {
    const size = options.size ?? BODY_SIZE;
    const indent = options.indent ?? 0;
    const height = Math.round(size * 1.4);
    const space = this.faces.regular.widthOfTextAtSize(' ', size);
    const color = options.muted ? MUTED : INK;
    const width = (word: Word) =>
      word.reduce(
        (sum, part) => sum + part.font.widthOfTextAtSize(part.text, size),
        0,
      );

    const lines: Word[][] = [];
    let line: Word[] = [];
    let used = 0;
    for (const word of this.words(runs)) {
      if (word === null) {
        lines.push(line);
        line = [];
        used = 0;
        continue;
      }
      const extra = (line.length > 0 ? space : 0) + width(word);
      // An overlong word overhangs rather than breaking, as in `wrap`.
      if (line.length > 0 && used + extra > this.width - indent) {
        lines.push(line);
        line = [word];
        used = width(word);
      } else {
        line.push(word);
        used += extra;
      }
    }
    if (line.length > 0 || lines.length === 0) lines.push(line);

    lines.forEach((words, index) => {
      this.ensure(height);
      if (index === 0 && options.marker) {
        const marker = this.plain(options.marker);
        this.write(marker, {
          x:
            MARGIN +
            indent -
            this.widthOf(marker, this.faces.regular, size) -
            space * 2,
          y: this.y,
          size,
          font: this.faces.regular,
          color,
        });
      }
      let x = MARGIN + indent;
      words.forEach((word, position) => {
        if (position > 0) x += space;
        for (const part of word) {
          this.write(part.text, { x, y: this.y, size, font: part.font, color });
          x += part.font.widthOfTextAtSize(part.text, size);
        }
      });
      this.y -= height;
    });
  }

  /** Splits runs into words, gluing across a change of weight with no space
   * between; `null` is a forced break. */
  private words(runs: readonly TextRun[]): (Word | null)[] {
    const words: (Word | null)[] = [];
    let current: Word | null = null;
    for (const run of runs) {
      if ('break' in run) {
        words.push(null);
        current = null;
        continue;
      }
      const font = run.bold ? this.faces.bold : this.faces.regular;
      for (const part of this.plain(run.text).split(/(\s+)/)) {
        if (part === '') continue;
        if (/^\s+$/.test(part)) {
          current = null;
        } else if (current) {
          current.push({ text: part, font });
        } else {
          current = [{ text: part, font }];
          words.push(current);
        }
      }
    }
    return words;
  }

  rule(): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 8 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y + 8 },
      thickness: 0.5,
      color: RULE,
    });
    this.y -= 8;
  }

  private draw(
    text: string,
    options: { size: number; font: PDFFont; height: number; color?: RGB },
  ): void {
    this.ensure(options.height);
    this.write(text, {
      x: MARGIN,
      y: this.y,
      size: options.size,
      font: options.font,
      color: options.color ?? INK,
    });
    this.y -= options.height;
  }

  /** Starts a page where what is about to be drawn will not fit on this one. */
  private ensure(height: number): void {
    if (this.y - height < MARGIN) {
      this.page = this.newPage();
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  private newPage(): PDFPage {
    return this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }
}

/**
 * What a standard face can write: the Latin alphabets, their accents and
 * umlauts, and the punctuation and currency marks around them (WinAnsi).
 *
 * Anything else becomes a question mark rather than an exception — pdf-lib
 * refuses to draw a character it cannot encode, and one product name in
 * another script would otherwise cost the customer their whole document. A
 * deployment writing in another script names its own face
 * (`branding.font.pdf`); this is the honest failure for one that has not.
 */
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function winAnsi(text: string): string {
  return [...text]
    .map((character) =>
      character.charCodeAt(0) < 0x100 || WIN_ANSI_EXTRAS.includes(character)
        ? character
        : '?',
    )
    .join('');
}

/**
 * Greedy word wrap against the embedded face's own metrics. A word longer than
 * the column — a URL, a part number — is left to overhang rather than broken:
 * a document is a thing somebody reads back to somebody else, and a hyphen
 * this inserted would be read out as part of the code.
 */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}
