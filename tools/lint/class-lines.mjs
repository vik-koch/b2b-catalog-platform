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

/** A `${…}` in a template literal: a class list of its own, laid out as one class. */
const isExpression = (token) => token.startsWith('${');

function isClassList(tokens) {
  tokens = tokens.filter((token) => !isExpression(token));
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

/**
 * The variant a class is grouped by: its first, ignoring colons inside `[…]` and `(…)`. A leading
 * `not-…` only narrows the state after it, so `not-disabled:hover:` groups with the hovers.
 */
function leadingVariant(token) {
  if (isExpression(token)) return '';
  const variants = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) {
      variants.push(token.slice(start, i));
      start = i + 1;
    }
  }
  if (variants.length > 1 && variants[0].startsWith('not-')) {
    return variants.slice(0, 2).join(':');
  }
  return variants[0] ?? '';
}

/** The lines `tokens` are laid out in when the first sits at `column`. */
function layout(tokens, column) {
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

const words = (text) => text.trim().split(/\s+/).filter(Boolean);

/**
 * The classes of a template literal, each `${…}` one of them, or null when an
 * expression is glued to a class (`gap-${size}`): that cannot be moved apart.
 */
function templateTokens(node, sourceCode) {
  const tokens = [];
  node.quasis.forEach((quasi, i) => {
    tokens.push(...words(quasi.value.raw));
    const expression = node.expressions[i];
    if (expression) tokens.push(`\${${sourceCode.getText(expression)}}`);
  });
  const glued = node.expressions.some((_, i) => {
    const before = node.quasis[i].value.raw;
    const after = node.quasis[i + 1].value.raw;
    return (before && !/\s$/.test(before)) || (after && !/^\s/.test(after));
  });
  // An expression written over several lines has no place in a line of classes.
  const spread = node.expressions.some((e) =>
    sourceCode.getText(e).includes('\n'),
  );
  return glued || spread ? null : tokens;
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
    /** `tokens` are the classes; `lead` and `trail` the spaces at either end. */
    function check(node, tokens, lead, trail) {
      if (!isClassList(tokens)) return;
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

      const source = sourceCode.getText(node);
      // A piece of a concatenation keeps the spaces that join it to the next.
      const column = node.loc.start.column + 1 + lead.length;
      const lines = layout(tokens, column);
      // A string that fits and is written on one line is left as written.
      if (lines.length === 1 && !source.includes('\n')) return;
      const body = `${lead}${lines.join(`\n${' '.repeat(column)}`)}${trail}`;
      // Only a template literal can span lines or hold an expression.
      const quote =
        lines.length > 1 || node.expressions?.length
          ? '`'
          : node.type === 'Literal'
            ? node.raw[0]
            : body.includes("'")
              ? '"'
              : "'";
      const expected = `${quote}${body}${quote}`;
      if (source === expected) return;
      context.report({
        node,
        messageId: 'layout',
        fix: (fixer) => fixer.replaceText(node, expected),
      });
    }
    return {
      Literal(node) {
        if (typeof node.value !== 'string' || /\\/.test(node.raw)) return;
        const text = node.value;
        check(node, words(text), text.match(/^\s*/)[0], text.match(/\s*$/)[0]);
      },
      TemplateLiteral(node) {
        if (node.parent?.type === 'TaggedTemplateExpression') return;
        const raws = node.quasis.map((quasi) => quasi.value.raw);
        if (raws.some((raw) => /\\|`/.test(raw))) return;
        const tokens = templateTokens(node, sourceCode);
        if (!tokens) return;
        check(
          node,
          tokens,
          raws[0].match(/^\s*/)[0],
          raws.at(-1).match(/\s*$/)[0],
        );
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
          if (value.includes('{{') || !isClassList(words(value))) continue;
          const start = attribute.valueSpan.start.offset;
          const end = attribute.valueSpan.end.offset;
          // The span may or may not include the quotes; anchor on the text itself.
          const inner = text.slice(start, end);
          const quoted = inner.startsWith('"') || inner.startsWith("'");
          const from = quoted ? start + 1 : start;
          const to = quoted ? end - 1 : end;
          const column = columnOf(text, from);
          const expected = layout(words(value), column).join(
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
