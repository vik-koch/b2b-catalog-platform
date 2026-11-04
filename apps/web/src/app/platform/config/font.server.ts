import { getDeploymentConfig } from './deployment-config.server';

/**
 * A deployment's own typeface, when it declares one: the `@font-face`
 * stylesheet from the assets mount, and the family itself set on `:root`.
 *
 * Both go into the document head server-side rather than onto the app's root
 * element, for two different reasons. The stylesheet, because one the running
 * app appends arrives after the first paint — the flash of one font replaced by
 * another on every cold load. The family, because `:root` also covers what the
 * app renders outside its own tree: the confirm dialog is created on `<body>`,
 * and a modal in a different typeface from the page behind it is the one place
 * the difference is unmissable.
 *
 * Serialized once per process — the config is an immutable mounted file.
 */
let cachedHead: string | undefined;

/**
 * `<` is escaped so nothing in the config can close the tag early and inject
 * markup. The file is trusted; the tag is emitted into every page and must not
 * depend on that.
 */
function getFontHead(): string {
  if (cachedHead === undefined) {
    const font = getDeploymentConfig().branding.font;
    if (!font) return (cachedHead = '');
    const link = font.stylesheet
      ? `<link rel="stylesheet" href="/${encodeURI(font.stylesheet)}">`
      : '';
    const family = font.family.replace(/</g, '\\3c ');
    cachedHead = `${link}<style>:root{--font-sans:${family};font-family:${family}}</style>`;
  }
  return cachedHead;
}

/** Adds them to a document the Angular engine produced. */
export function injectFontHead(html: string): string {
  const head = getFontHead();
  return head ? html.replace('</head>', `${head}</head>`) : html;
}
