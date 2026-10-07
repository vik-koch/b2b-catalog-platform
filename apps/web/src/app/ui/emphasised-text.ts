import { Component, computed, input } from '@angular/core';

export interface TextPart {
  readonly text: string;
  readonly bold: boolean;
}

const BOLD = /<b>(.*?)<\/b>/gs;

/**
 * Splits a config sentence on `<b>…</b>`. Only that one pair is read; any other
 * markup, and a `<b>` left unclosed, stays literal text and is escaped like
 * the rest.
 */
export function emphasisParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last)
      parts.push({ text: text.slice(last, match.index), bold: false });
    if (match[1]) parts.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

/**
 * A deployment's own sentence, with the words it marked `<b>` set in bold —
 * a zone's or a pickup point's description. Rendered as text nodes, never as
 * HTML, so a config value cannot carry anything else onto the page.
 */
@Component({
  selector: 'app-emphasised',
  host: { class: 'contents' },
  // One line: whitespace between the parts is the text's own, and any line
  // break in here would add a space around every part.
  // prettier-ignore
  template: `@for (part of parts(); track $index) {@if (part.bold) {<b class="font-semibold text-ink">{{ part.text }}</b>} @else {{{ part.text }}}}`,
})
export class EmphasisedText {
  readonly text = input.required<string>();

  protected readonly parts = computed(() => emphasisParts(this.text()));
}
