import { Component, computed, input } from '@angular/core';

export interface TextPart {
  readonly text: string;
  readonly bold: boolean;
}

const BOLD = /<b>(.*?)<\/b>/gs;

/**
 * Splits a sentence on `<b>…</b>`. Only that pair is read; other markup, and
 * an unclosed `<b>`, stay literal text.
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
 * A sentence with the words it marks `<b>` set in bold. Rendered as text
 * nodes, never as HTML, so the sentence can carry nothing else onto the page.
 */
@Component({
  selector: 'ui-emphasised',
  host: { class: 'contents' },
  // One line: a line break in here would add a space around every part.
  // prettier-ignore
  template: `@for (part of parts(); track $index) {@if (part.bold) {<b class="font-medium text-ink">{{ part.text }}</b>} @else {{{ part.text }}}}`,
})
export class EmphasisedText {
  readonly text = input.required<string>();

  protected readonly parts = computed(() => emphasisParts(this.text()));
}
