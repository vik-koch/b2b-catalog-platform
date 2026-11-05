#!/usr/bin/env node
/**
 * Renders every message the app can send, both parts, as the mailer would,
 * from a deployment's `texts/mail.json` and `deployment.json`. Committed, so a
 * reworded template is a reviewable diff, and a way to proofread a
 * translation without sending anything:
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
const CONFIG_DIR = flag('config-dir', 'deployments/fixture/config');
/** A scratch render: no markdown index, no orphan check, nothing in `docs/`. */
const OUT = flag('out', null);
const DIR = OUT ?? 'docs/mail';
const INDEX = 'docs/mail.md';

/**
 * The index's links: GitHub shows a committed `.html` as source, so a viewer
 * renders the raw file. `HEAD`, not the current branch: the default branch is
 * what a reader means, and a branch name leaves dead links after a merge. A
 * preview added on a branch renders once it lands.
 */
const repository = JSON.parse(readFileSync('package.json', 'utf8'))
  .repository.url.replace(/^https:\/\/github\.com\//, '')
  .replace(/\.git$/, '');
const rendered = (slug) =>
  `https://htmlpreview.github.io/?https://raw.githubusercontent.com/${repository}/HEAD/docs/mail/${slug}.html`;

const { mailTextSchema } = await loadTypeScript(
  'apps/api/src/app/app.texts.ts',
);
const { sharedTextSchema } = await loadTypeScript(
  'libs/shared/src/platform/config/shared-text.ts',
);
const { renderMailPreviews, MAIL_PREVIEW_GROUPS } = await loadTypeScript(
  'apps/api/src/app/mail-previews.ts',
);
const { mailColors } = await loadTypeScript(
  'apps/api/src/platform/mail/mail-colors.ts',
);

/** The wording, validated as the API does at boot, so a translation missing
 * a section says which. */
const parseConfig = (schema, file) => {
  const parsed = schema.safeParse(
    JSON.parse(readFileSync(`${CONFIG_DIR}/${file}`, 'utf8')),
  );
  if (!parsed.success) {
    console.error(
      `${CONFIG_DIR}/${file} is not valid:\n${parsed.error.issues
        .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
    process.exit(1);
  }
  return parsed.data;
};
const mailText = parseConfig(mailTextSchema, 'texts/mail.json');
const sharedText = parseConfig(sharedTextSchema, 'texts/shared.json');
const deployment = JSON.parse(
  readFileSync(`${CONFIG_DIR}/deployment.json`, 'utf8'),
);
const branding = {
  name: deployment.branding.name,
  primaryColor: deployment.branding.theme.primary,
  colors: mailColors(deployment.branding.theme),
  // Not the deployment's real origin: that is an environment variable, and a
  // gallery whose links changed with whoever generated it would be unreviewable.
  shopUrl: 'https://shop.example.com',
  locale: deployment.locale,
};

const escape = (value) =>
  value.replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );

const previews = renderMailPreviews(mailText, sharedText, branding);
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

/** The index sits beside the folder and groups messages as a reader looks
 * for them (signing up, the account, an order), not in definition order. */
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
    "the fixture's `texts/mail.json` and `deployment.json`. Both parts of each",
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
