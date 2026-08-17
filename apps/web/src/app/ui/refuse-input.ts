/**
 * Refuse a keystroke that would make a field's text invalid.
 *
 * At `beforeinput`, so the rejected character never reaches the field and the
 * caret never moves: nothing to undo, nothing to re-render, no error message for
 * a keystroke that simply does not apply. Deletions and anything without
 * inserted text pass untouched.
 *
 * `allowed` is asked about the text the field *would* hold, so it describes what
 * a value may look like part-way through typing, not what counts as finished.
 */
export function refuseUnless(
  event: InputEvent,
  allowed: (next: string) => boolean,
): void {
  // Paste carries its text on the dataTransfer instead of `data`; a null both
  // ways is a deletion or a composition end, which can only shorten or replace
  // what is already valid.
  const inserted = event.data ?? event.dataTransfer?.getData('text') ?? null;
  if (inserted === null) return;

  const input = event.target as HTMLInputElement;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const next = input.value.slice(0, start) + inserted + input.value.slice(end);

  if (!allowed(next)) event.preventDefault();
}
