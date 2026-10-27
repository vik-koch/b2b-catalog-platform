/**
 * A long list of classes, laid out so it can be read: one line when it fits,
 * otherwise the classes without a variant first, then one line per leading
 * variant (`hover:`, `active:`, `disabled:` with `disabled:hover:`), a line
 * wrapping only when its group does not fit, every line aligned under the
 * first class. Prettier leaves the inside of a string alone, so this is the
 * only thing that lays it out.
 *
 * `class-lines` covers strings in TypeScript, `template-class-lines` the
 * `class` attribute in a template.
 */

const WIDTH = 80;
/** Room for what follows the last class: a closing quote and a comma or `>`. */
const CLOSING = 2;

/** Tailwind classes, not prose: lower case outside arbitrary values, no sentence punctuation. */
const CLASS_TOKEN = /^!?[a-z0-9@&>*:/.\-_%#=~+<(),'"]+!?$/;

function isClassList(text) {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length < 3) return false;
  const plain = tokens.map((token) => token.replace(/\[[^\]]*\]/g, ''));
  if (
    !plain.every((token) => CLASS_TOKEN.test(token) && !/[.,]$/.test(token))
  ) {
    return false;
  }
  return (
    tokens.filter((token) => /[-:]/.test(token)).length * 2 >= tokens.length
  );
}

/** The variant a class starts with, ignoring colons inside `[…]` and `(…)`. */
function leadingVariant(token) {
  let depth = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) return token.slice(0, i);
  }
  return '';
}

/** The lines `text` is laid out in when its first class sits at `column`. */
function layout(text, column) {
  const tokens = text.trim().split(/\s+/);
  const single = tokens.join(' ');
  if (column + single.length + CLOSING <= WIDTH) return [single];

  const groups = new Map([['', []]]);
  for (const token of tokens) {
    const variant = leadingVariant(token);
    if (!groups.has(variant)) groups.set(variant, []);
    groups.get(variant).push(token);
  }
  const room = WIDTH - column - CLOSING;
  const lines = [];
  for (const group of groups.values()) {
    let line = '';
    for (const token of group) {
      if (line && line.length + 1 + token.length > room) {
        lines.push(line);
        line = token;
      } else {
        line = line ? `${line} ${token}` : token;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function columnOf(text, offset) {
  return offset - (text.lastIndexOf('\n', offset - 1) + 1);
}

/** Decorator properties whose strings are code of another kind. */
const NOT_CLASSES = new Set(['template', 'styles', 'selector']);

const classLinesRule = {
  meta: {
    type: 'layout',
    fixable: 'code',
    messages: {
      layout:
        'Lay the classes out one variant to a line (tools/lint/class-lines.mjs).',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    function check(node, text) {
      if (!isClassList(text)) return;
      const parent = node.parent;
      if (parent?.type === 'Property' && parent.key === node) return;
      if (parent?.type === 'Property' && NOT_CLASSES.has(parent.key?.name))
        return;
      if (
        parent?.type === 'ImportDeclaration' ||
        parent?.type === 'ExportNamedDeclaration'
      )
        return;
      if (parent?.type === 'TSLiteralType') return;

      // A piece of a concatenation keeps the spaces that join it to the next.
      const lead = text.match(/^\s*/)[0];
      const trail = text.match(/\s*$/)[0];
      const column = node.loc.start.column + 1 + lead.length;
      const lines = layout(text, column);
      if (
        lines.length === 1 &&
        text.replace(/\s+/g, ' ') === `${lead && ' '}${lines[0]}${trail && ' '}`
      ) {
        return;
      }
      const body = `${lead}${lines.join(`\n${' '.repeat(column)}`)}${trail}`;
      const quote =
        node.type === 'Literal' ? node.raw[0] : body.includes("'") ? '"' : "'";
      const expected =
        lines.length === 1 ? `${quote}${body}${quote}` : `\`${body}\``;
      if (sourceCode.getText(node) === expected) return;
      context.report({
        node,
        messageId: 'layout',
        fix: (fixer) => fixer.replaceText(node, expected),
      });
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string' && !/\\/.test(node.raw))
          check(node, node.value);
      },
      TemplateLiteral(node) {
        if (
          node.expressions.length > 0 ||
          node.parent?.type === 'TaggedTemplateExpression'
        )
          return;
        const raw = node.quasis[0].value.raw;
        if (/\\|`|\$\{/.test(raw)) return;
        check(node, raw);
      },
    };
  },
};

const templateClassLinesRule = {
  meta: {
    type: 'layout',
    fixable: 'code',
    messages: {
      layout:
        'Lay the classes out one variant to a line (tools/lint/class-lines.mjs).',
    },
    schema: [],
  },
  create(context) {
    const text = context.sourceCode.text;
    return {
      Element(element) {
        for (const attribute of element.attributes) {
          if (attribute.name !== 'class' || !attribute.valueSpan) continue;
          const value = attribute.value;
          if (value.includes('{{') || !isClassList(value)) continue;
          const start = attribute.valueSpan.start.offset;
          const end = attribute.valueSpan.end.offset;
          // The span may or may not include the quotes; anchor on the text itself.
          const inner = text.slice(start, end);
          const quoted = inner.startsWith('"') || inner.startsWith("'");
          const from = quoted ? start + 1 : start;
          const to = quoted ? end - 1 : end;
          const column = columnOf(text, from);
          const expected = layout(value, column).join(
            `\n${' '.repeat(column)}`,
          );
          if (text.slice(from, to) === expected) continue;
          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(from),
              end: context.sourceCode.getLocFromIndex(to),
            },
            messageId: 'layout',
            fix: (fixer) => fixer.replaceTextRange([from, to], expected),
          });
        }
      },
    };
  },
};

const plugin = {
  rules: {
    'class-lines': classLinesRule,
    'template-class-lines': templateClassLinesRule,
  },
};

/** The two rules, for a project whose templates and strings carry classes. */
export const classLines = [
  {
    files: ['**/*.ts'],
    ignores: ['**/*.spec.ts'],
    plugins: { local: plugin },
    rules: { 'local/class-lines': 'error' },
  },
  {
    files: ['**/*.html'],
    ignores: ['**/*.spec.ts/**'],
    plugins: { local: plugin },
    rules: { 'local/template-class-lines': 'error' },
  },
];
