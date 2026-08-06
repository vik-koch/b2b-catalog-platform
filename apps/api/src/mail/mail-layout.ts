import { MailBranding } from './mail-branding';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Everything a template produces passes through here, so no template can forget
 * it: user input (an inquiry message, an email address) ends up in an HTML mail
 * and must not be able to inject markup.
 */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

/** A label/value pair, rendered as a two-column row. */
export interface MailRow {
  readonly label: string;
  readonly value: string;
}

/** A single call to action. At most one per message, by design. */
export interface MailAction {
  readonly label: string;
  /** Absolute URL — mail is read outside the app, so nothing relative works. */
  readonly url: string;
}

/**
 * What a template produces: the content of one message, with no markup in it.
 * Templates decide *what* is said; this module decides how it looks, so the
 * whole app's mail stays one design and a new message is a small object.
 */
export interface MailContent {
  readonly subject: string;
  /** Inbox preview line — hidden in the body, shown next to the subject. */
  readonly preheader: string;
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly rows?: readonly MailRow[];
  readonly action?: MailAction;
}

export interface RenderedMail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/**
 * The branded layout, shared by every message.
 *
 * Table-based with inline styles, because email clients are not browsers: no
 * flexbox, no grid, no `<style>` block worth relying on, and Outlook renders
 * through Word. Nothing external is referenced — no web font, no image, no
 * tracking pixel — so the message renders the same whether or not the client
 * blocks remote content, which by default it does.
 *
 * Branding is therefore typographic: the shop name as a wordmark on a band in
 * the deployment's primary colour. A logo image would be invisible in exactly
 * the clients that matter most until the reader opts in.
 */
export function renderMail(
  content: MailContent,
  branding: MailBranding,
  footerNote: string,
): RenderedMail {
  return {
    subject: content.subject,
    html: renderHtml(content, branding, footerNote),
    text: renderText(content, branding, footerNote),
  };
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function renderHtml(
  content: MailContent,
  branding: MailBranding,
  footerNote: string,
): string {
  const parts: string[] = [];

  for (const paragraph of content.paragraphs ?? []) {
    parts.push(
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(
        paragraph,
      )}</p>`,
    );
  }

  if (content.rows?.length) {
    const rows = content.rows
      .map(
        (row) =>
          `<tr>` +
          `<td style="padding:6px 12px 6px 0;font-size:14px;color:#6b7280;vertical-align:top;white-space:nowrap;">${escapeHtml(
            row.label,
          )}</td>` +
          // Long words (a URL, an unbroken message) must wrap rather than
          // stretch the table past the card on a phone.
          `<td style="padding:6px 0;font-size:14px;color:#1f2937;word-break:break-word;">${escapeHtml(
            row.value,
          )}</td>` +
          `</tr>`,
      )
      .join('');
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">${rows}</table>`,
    );
  }

  if (content.action) {
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">` +
        `<tr><td style="border-radius:6px;background:${escapeHtml(
          branding.primaryColor,
        )};">` +
        `<a href="${escapeHtml(
          content.action.url,
        )}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(
          content.action.label,
        )}</a>` +
        `</td></tr></table>` +
        // Buttons are unreliable (some clients strip the styling, some readers
        // copy links out), so the URL is always readable as text too.
        `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6b7280;word-break:break-all;">${escapeHtml(
          content.action.url,
        )}</p>`,
    );
  }

  return `<!doctype html>
<html lang="und">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    content.preheader,
  )}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:${escapeHtml(
    branding.primaryColor,
  )};padding:20px 28px;font-size:18px;font-weight:700;color:#ffffff;">${escapeHtml(
    branding.name,
  )}</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(
    content.heading,
  )}</h1>
${parts.join('\n')}
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
<tr><td style="padding:16px 28px;font-size:12px;line-height:1.6;color:#6b7280;">
${escapeHtml(footerNote)}<br>
<a href="${escapeHtml(
    branding.siteUrl,
  )}" style="color:#6b7280;">${escapeHtml(branding.siteUrl)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * The plain-text alternative, rendered from the same content object rather than
 * stripped from the HTML — so it stays readable, and so a template can never
 * ship one without the other.
 */
function renderText(
  content: MailContent,
  branding: MailBranding,
  footerNote: string,
): string {
  const blocks: string[] = [content.heading];

  for (const paragraph of content.paragraphs ?? []) {
    blocks.push(paragraph);
  }
  if (content.rows?.length) {
    blocks.push(
      content.rows.map((row) => `${row.label}: ${row.value}`).join('\n'),
    );
  }
  if (content.action) {
    blocks.push(`${content.action.label}: ${content.action.url}`);
  }
  blocks.push(`--\n${branding.name}\n${footerNote}\n${branding.siteUrl}`);

  return blocks.join('\n\n');
}
