import { emphasisParts } from './emphasised-text';

describe('emphasisParts', () => {
  it('splits on <b> pairs', () => {
    expect(emphasisParts('Free from <b>150 €</b> in <b>town</b>.')).toEqual([
      { text: 'Free from ', bold: false },
      { text: '150 €', bold: true },
      { text: ' in ', bold: false },
      { text: 'town', bold: true },
      { text: '.', bold: false },
    ]);
  });

  it('leaves an unclosed tag and any other markup as text', () => {
    expect(emphasisParts('a <b>b <i>c</i>')).toEqual([
      { text: 'a <b>b <i>c</i>', bold: false },
    ]);
  });

  it('is the whole text when nothing is marked', () => {
    expect(emphasisParts('plain')).toEqual([{ text: 'plain', bold: false }]);
  });
});
