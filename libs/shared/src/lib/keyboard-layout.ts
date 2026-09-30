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
