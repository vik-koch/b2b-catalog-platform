import { placeholderPdf } from './document-placeholders';

describe('placeholderPdf', () => {
  const text = (pdf: Buffer) => pdf.toString('latin1');

  it('tells the font to use WinAnsi', () => {
    expect(text(placeholderPdf('Title', []))).toContain(
      '/BaseFont /Helvetica /Encoding /WinAnsiEncoding',
    );
  });

  it('writes Latin-1 letters as their own byte', () => {
    const pdf = placeholderPdf('Prüfzertifikat', ['Größe', 'Café']);
    expect(pdf.includes(Buffer.from('Pr\xfcfzertifikat', 'latin1'))).toBe(true);
    expect(pdf.includes(Buffer.from('Gr\xf6\xdfe', 'latin1'))).toBe(true);
    expect(pdf.includes(Buffer.from('Caf\xe9', 'latin1'))).toBe(true);
  });

  it('writes the WinAnsi extras as their WinAnsi byte', () => {
    const pdf = placeholderPdf('„Qualität“ – 12 €', []);
    expect(
      pdf.includes(Buffer.from('\x84Qualit\xe4t\x93 \x96 12 \x80', 'latin1')),
    ).toBe(true);
  });

  it('writes a character WinAnsi lacks as a question mark', () => {
    expect(text(placeholderPdf('Ω ✓', []))).toContain('(? ?)');
  });

  it('escapes the string delimiters', () => {
    expect(text(placeholderPdf('a (b) c\\d', []))).toContain(
      '(a \\(b\\) c\\\\d)',
    );
  });

  it('points the cross-reference table at the real byte offsets', () => {
    const pdf = text(placeholderPdf('„Größe“ – €', ['für']));
    const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) =>
      Number(match[1]),
    );
    offsets.forEach((offset, index) => {
      expect(pdf.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
  });
});
