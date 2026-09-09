#!/usr/bin/env node
/**
 * Renders every message the app can send, from a deployment's own config.
 *
 * A mail template is a function whose output nobody reads: the wording lives in
 * a mounted file, the layout in another module, and what a customer actually
 * receives exists only in an inbox. So the previews are committed — both parts
 * of every message, exactly as the mailer would send them — and a reworded
 * template shows up as a reviewable diff.
 *
 * They are rendered from `config/mail-text.json` and `config/deployment.json`
 * rather than from a fixture, which makes this the way to proof-read a
 * deployment's wording — a translation especially — without sending anything:
 *
 *   node tools/generate-mail-previews.mjs --config-dir ../my-deployment/config \
 *     --out tmp/mail
 *
 * and open `gallery.html`. With `--out` nothing in `docs/` is touched, so a
 * check against somebody else's wording leaves no diff behind.
 *
 * Run `node tools/generate-mail-previews.mjs` (or `npx nx mail-previews`) after
 * changing a template, the layout or the demo wording. `--check` verifies the
 * committed files match, which is what CI runs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import {
  formatted,
  loadTypeScript,
  writeOrCheck,
} from './lib/generated-docs.mjs';

const COMMAND = 'tools/generate-mail-previews.mjs';
const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const CONFIG_DIR = flag('config-dir', 'config');
/** A scratch render: no markdown index, no orphan check, nothing in `docs/`. */
const OUT = flag('out', null);
const DIR = OUT ?? 'docs/mail';
const INDEX = 'docs/mail.md';

/**
 * The links the index offers. GitHub serves a committed `.html` as source, so
 * the only way to *see* a message from the documentation is a third-party
 * renderer pointed at the raw file.
 *
 * `HEAD` rather than a branch name: the default branch is the copy a reader of
 * the documentation means, and naming it would go stale if it were ever
 * renamed. Deliberately not the branch being generated on — that would make
 * the committed files depend on where they were generated, and leave dead
 * links behind every merged branch. The cost is that a preview added on a
 * feature branch has nothing to render until it lands.
 */
const repository = JSON.parse(readFileSync('package.json', 'utf8')).repository
  .url.replace(/^https:\/\/github\.com\//, '')
  .replace(/\.git$/, '');
const rendered = (slug) =>
  `https://htmlpreview.github.io/?https://raw.githubusercontent.com/${repository}/HEAD/docs/mail/${slug}.html`;

const { mailTextSchema } = await loadTypeScript('apps/api/src/mail/mail-text.ts');
const { renderMailPreviews, MAIL_PREVIEW_GROUPS } = await loadTypeScript(
  'apps/api/src/mail/mail-previews.ts',
);

/**
 * The wording, validated the way the API validates it at boot. A translated
 * file with a section missing has to say which one — that is most of the point
 * of rendering somebody else's config here.
 */
const parsed = mailTextSchema.safeParse(
  JSON.parse(readFileSync(`${CONFIG_DIR}/mail-text.json`, 'utf8')),
);
if (!parsed.success) {
  console.error(
    `${CONFIG_DIR}/mail-text.json is not valid mail wording:\n${parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')}`,
  );
  process.exit(1);
}
const deployment = JSON.parse(
  readFileSync(`${CONFIG_DIR}/deployment.json`, 'utf8'),
);
const branding = {
  name: deployment.branding.name,
  primaryColor: deployment.branding.theme.primary,
  // Not the deployment's real origin: that is an environment variable, and a
  // gallery whose links changed with whoever generated it would be unreviewable.
  siteUrl: 'https://shop.example.com',
};

const escape = (value) =>
  value.replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );

const previews = renderMailPreviews(parsed.data, branding);
const files = {};
for (const preview of previews) {
  files[`${DIR}/${preview.slug}.html`] = preview.rendered.html;
  files[`${DIR}/${preview.slug}.txt`] = preview.rendered.text;
}
files[`${DIR}/gallery.html`] = renderGallery(previews);
if (!OUT) files[INDEX] = formatted(renderIndex(previews), 'markdown');

/** Everything on one scrollable page: the file to open when the question is
 * "does this wording look right", which is one question and not twenty-three. */
function renderGallery(previews) {
  const sections = MAIL_PREVIEW_GROUPS.flatMap((group) => {
    const inGroup = previews.filter((preview) => preview.group === group);
    if (inGroup.length === 0) return [];
    return [
      `<h2>${group}</h2>`,
      ...inGroup.map(
        (preview) =>
          `<section>` +
          `<h3>${escape(preview.title)}</h3>` +
          `<p class="note">${escape(preview.note)}</p>` +
          `<p class="subject"><b>Subject:</b> ${escape(preview.rendered.subject)}</p>` +
          `<iframe src="./${preview.slug}.html" title="${escape(preview.title)}"></iframe>` +
          `</section>`,
      ),
    ];
  });
  return `<!doctype html>
<html lang="und">
<head>
<meta charset="utf-8">
<title>${escape(branding.name)} — email gallery</title>
<style>
body{font:15px/1.6 system-ui,sans-serif;margin:0 auto;padding:24px;max-width:820px;color:#1f2937;}
h1{margin:0 0 4px;} h2{margin:40px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;}
section{margin:24px 0;} h3{margin:0 0 4px;font-size:16px;}
.note,.subject{margin:0 0 8px;font-size:13px;color:#6b7280;}
iframe{width:100%;height:640px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;}
</style>
</head>
<body>
<h1>${escape(branding.name)} — email gallery</h1>
<p class="note">Every message the app can send, rendered from this deployment's own wording.</p>
${sections.join('\n')}
</body>
</html>
`;
}

/**
 * The index sits beside the folder rather than inside it, and groups the
 * messages the way somebody looking for one thinks about them — what a
 * customer gets while signing up, what happens to their account, what an order
 * sends — rather than in the order the templates happen to be defined.
 */
function renderIndex(previews) {
  const sections = MAIL_PREVIEW_GROUPS.flatMap((group) => {
    const inGroup = previews.filter((preview) => preview.group === group);
    if (inGroup.length === 0) return [];
    return [
      `## ${group}`,
      '',
      ...inGroup.flatMap((preview) => [
        // An explicit anchor, not the heading's: a title carrying an em dash
        // gets a slug nobody can predict, and `docs/order-lifecycle.md` links
        // at these by name.
        `<a id="${preview.slug}"></a>`,
        '',
        `### ${preview.title}`,
        '',
        preview.note,
        '',
        `**Subject:** ${preview.rendered.subject}  `,
        `**Preheader:** ${preview.content.preheader}`,
        '',
        `[View rendered](${rendered(preview.slug)}) · [HTML source](mail/${preview.slug}.html) · [Plain text](mail/${preview.slug}.txt)`,
        '',
      ]),
    ];
  });
  return [
    '<!-- Generated by tools/generate-mail-previews.mjs — do not edit by hand. -->',
    '',
    '# Email gallery',
    '',
    "Every message the app can send, rendered from this deployment's own",
    '`config/mail-text.json` and `config/deployment.json`. Both parts of each',
    'message are committed as the mailer would send them: read the plain text to',
    'review a change without wading through table markup, and open the rendered',
    'view to see it as a recipient would.',
    '',
    'GitHub serves a committed `.html` as source, so “View rendered” goes',
    'through htmlpreview.github.io, pointed at this file on the default branch',
    '— so a message added on a branch has nothing to render until it lands.',
    'Locally, open [mail/gallery.html](mail/gallery.html) instead — every',
    'message on one page, which is the file to use when proof-reading wording.',
    '',
    'To see another deployment’s wording without touching this repository:',
    '',
    '```sh',
    'node tools/generate-mail-previews.mjs \\',
    '  --config-dir path/to/config --out tmp/mail',
    '```',
    '',
    'The links below are for orders in particular: `docs/order-lifecycle.md`',
    'names these messages where a journey sends one.',
    '',
    ...sections,
  ].join('\n');
}

/** A preview that was renamed or removed must not leave its old file behind. */
if (!OUT) {
  let existing = [];
  try {
    existing = readdirSync(DIR);
  } catch {
    existing = [];
  }
  const orphans = existing
    .map((name) => `${DIR}/${name}`)
    .filter((path) => !(path in files));
  if (orphans.length > 0) {
    console.error(
      `${DIR} holds files no preview produces — delete them:\n${orphans
        .map((path) => `  ${path}`)
        .join('\n')}`,
    );
    process.exit(1);
  }
}

writeOrCheck(files, COMMAND);
