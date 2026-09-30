// @ts-expect-error -- convert-layout ships no type declarations.
import * as layouts from 'convert-layout';

/** The layouts `convert-layout` pairs with US QWERTY, by its own codes. */
export const KEYBOARD_LAYOUTS = [
  'ar',
  'by',
  'colemak',
  'cs',
  'de',
  'dvorak',
  'es',
  'fa',
  'gr',
  'he',
  'kk',
  'kr',
  'ru',
  'uk',
] as const;

export type KeyboardLayout = (typeof KEYBOARD_LAYOUTS)[number];

interface LayoutConverter {
  fromEn(text: string): string;
  toEn(text: string): string;
}

const LETTER = /^\p{L}$/u;

const converters = layouts as Record<KeyboardLayout, LayoutConverter>;

/**
 * The query as it would read had its keys been pressed on the other layout
 * (FR-SEARCH-08), or null where that changes nothing. Applied to the raw input,
 * before tokenizing: several layouts put letters on punctuation keys, which
 * the tokenizer would drop. Whitespace is never mapped, so the reading has the
 * same words in the same places as the query.
 *
 * Each word picks its own direction, since a visitor may switch layouts
 * mid-query. A letter only the other layout has, on a QWERTY letter key, means
 * the word was typed there and is read back as QWERTY; anything else is read
 * as QWERTY pressed on the other layout. An umlaut on a bracket key does not
 * count: nobody searches for a bracket.
 */
export function alternateLayoutQuery(
  query: string,
  layout: KeyboardLayout | null | undefined,
): string | null {
  if (!layout) return null;
  const converter = converters[layout];
  const mapped = query
    .split(/(\s+)/u)
    .map((word) =>
      typedOnOther(word, converter)
        ? converter.toEn(word)
        : converter.fromEn(word),
    )
    .join('');
  return mapped.toLowerCase() === query.toLowerCase() ? null : mapped;
}

function typedOnOther(word: string, converter: LayoutConverter): boolean {
  return Array.from(word).some((char) => {
    const back = converter.toEn(char);
    return (
      back !== char && converter.fromEn(char) === char && LETTER.test(back)
    );
  });
}
