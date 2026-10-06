import { ElementType, parseDocument } from 'htmlparser2';
import { TextRun } from './pdf-sheet';

type Node = ReturnType<typeof parseDocument>['children'][number];
type Element = Extract<Node, { attribs: unknown }>;

/** What a page body prints as: a column of blocks, each set by the sheet. */
export type RichBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; runs: TextRun[] }
  | { kind: 'text'; runs: TextRun[]; indent: number; marker?: string }
  | { kind: 'rule' };

/** How far a list or a quotation steps in, in PDF points. */
export const BLOCK_INDENT = 18;

const isElement = (node: Node): node is Element =>
  node.type === ElementType.Tag;

const BLOCK_TAGS = new Set([
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'img',
]);

/**
 * Reads a page body — already sanitized to the rich-text vocabulary — into
 * blocks. Inline weight survives as bold or regular, the only two faces a
 * document carries. A link prints its address beside its words, since a
 * printed link cannot be followed. Images are left out.
 */
export function richTextBlocks(html: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  walk(parseDocument(html).children, 0, blocks);
  return blocks;
}

function walk(nodes: readonly Node[], indent: number, out: RichBlock[]): void {
  // Inline content sitting directly among blocks still reads as a paragraph.
  let loose: Node[] = [];
  const flush = () => {
    const runs = inline(loose);
    if (hasText(runs)) out.push({ kind: 'text', runs, indent });
    loose = [];
  };
  for (const node of nodes) {
    if (!isElement(node) || !BLOCK_TAGS.has(node.name)) {
      loose.push(node);
      continue;
    }
    flush();
    block(node, indent, out);
  }
  flush();
}

function block(node: Element, indent: number, out: RichBlock[]): void {
  switch (node.name) {
    case 'h2':
    case 'h3':
    case 'h4':
      out.push({
        kind: 'heading',
        level: Number(node.name[1]) as 2 | 3 | 4,
        runs: inline(node.children),
      });
      return;
    case 'p': {
      const runs = inline(node.children);
      if (hasText(runs)) out.push({ kind: 'text', runs, indent });
      return;
    }
    case 'hr':
      out.push({ kind: 'rule' });
      return;
    case 'blockquote':
      walk(node.children, indent + BLOCK_INDENT, out);
      return;
    case 'ul':
    case 'ol': {
      const items = node.children.filter(
        (child): child is Element => isElement(child) && child.name === 'li',
      );
      items.forEach((item, index) => {
        const marker = node.name === 'ol' ? `${index + 1}.` : '•';
        const start = out.length;
        walk(item.children, indent + BLOCK_INDENT, out);
        // The marker hangs beside the item's first line of text.
        const first = out
          .slice(start)
          .find(
            (entry): entry is Extract<RichBlock, { kind: 'text' }> =>
              entry.kind === 'text',
          );
        if (first) first.marker = marker;
      });
      return;
    }
    default:
      // `img`, and a stray `li`: nothing a printed text needs.
      return;
  }
}

function inline(nodes: readonly Node[], bold = false): TextRun[] {
  const runs: TextRun[] = [];
  for (const node of nodes) {
    if (node.type === ElementType.Text) {
      runs.push({ text: node.data.replace(/\s+/g, ' '), bold });
    } else if (isElement(node)) {
      if (node.name === 'br') {
        runs.push({ break: true });
      } else if (node.name === 'a') {
        runs.push(...inline(node.children, bold));
        const href = (node.attribs['href'] ?? '').replace(/^mailto:/, '');
        const words = textOf(node.children).trim();
        if (href && href !== words) runs.push({ text: ` (${href})`, bold });
      } else {
        runs.push(...inline(node.children, bold || node.name === 'strong'));
      }
    }
  }
  return runs;
}

function textOf(nodes: readonly Node[]): string {
  return nodes
    .map((node) =>
      node.type === ElementType.Text
        ? node.data
        : isElement(node)
          ? textOf(node.children)
          : '',
    )
    .join('');
}

function hasText(runs: readonly TextRun[]): boolean {
  return runs.some((run) => 'text' in run && run.text.trim() !== '');
}
