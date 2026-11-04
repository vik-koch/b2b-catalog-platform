import { getDeploymentConfig } from './deployment-config.server';

/**
 * A deployment's own typeface, written into the head on the server: a
 * stylesheet the app appended would arrive after the first paint, and the
 * family on `:root` also reaches the dialogs created on `<body>`.
 */
let cachedHead: string | undefined;

/** `<` is escaped, as for the shell state. */
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
