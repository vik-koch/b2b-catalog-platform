import type { MailBranding } from './mail-branding';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Applied by the layout to everything, so no template can forget it. */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

/** A label/value pair, rendered as a two-column row. */
export interface MailRow {
  readonly label: string;
  readonly value: string;
}

/** One ordered line, its amounts already formatted: the layout knows nothing
 * of money. */
export interface MailItem {
  readonly name: string;
  readonly quantity: string;
  /** Customer-typed (FR-CART-08), so it is escaped like everything else. */
  readonly note?: string;
  readonly total: string;
}

/** At most one per message. */
interface MailAction {
  readonly label: string;
  /** A path in the app (`/admin/users`), made absolute by the layout. */
  readonly path: string;
}

/** One message's content, with no markup: the layout decides how it looks. */
export interface MailContent {
  readonly subject: string;
  /** The inbox preview beside the subject, hidden in the body. */
  readonly preheader: string;
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly rows?: readonly MailRow[];
  /** An order's lines, under their own heading. */
  readonly items?: readonly MailItem[];
  readonly itemsHeading?: string;
  readonly action?: MailAction;
}

export interface RenderedMail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/**
 * Tables and inline styles, as mail clients are not browsers (Outlook renders
 * through Word). Nothing external, not even a logo, as clients block remote
 * content by default: the brand is a wordmark on a primary-colour band.
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

/** `shopUrl` never ends in a slash (see loadMailBranding), a path always starts with one. */
const actionUrl = (path: string, branding: MailBranding): string =>
  `${branding.shopUrl}${path.startsWith('/') ? path : `/${path}`}`;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function renderHtml(
  content: MailContent,
  branding: MailBranding,
  footerNote: string,
): string {
  const color = branding.colors;
  const parts: string[] = [];

  for (const paragraph of content.paragraphs ?? []) {
    parts.push(
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${color.ink};">${escapeHtml(
        paragraph,
      )}</p>`,
    );
  }

  if (content.rows?.length) {
    const rows = content.rows
      .map(
        (row) =>
          `<tr>` +
          `<td style="padding:6px 12px 6px 0;font-size:14px;color:${color.inkSubtle};vertical-align:top;white-space:nowrap;">${escapeHtml(
            row.label,
          )}</td>` +
          // A long word wraps rather than stretching the card on a phone.
          `<td style="padding:6px 0;font-size:14px;color:${color.ink};word-break:break-word;">${escapeHtml(
            row.value,
          )}</td>` +
          `</tr>`,
      )
      .join('');
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">${rows}</table>`,
    );
  }

  if (content.items?.length) {
    const heading = content.itemsHeading
      ? `<tr><td colspan="2" style="padding:0 0 6px;font-size:13px;font-weight:600;color:${color.inkSubtle};text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(
          content.itemsHeading,
        )}</td></tr>`
      : '';
    const items = content.items
      .map(
        (item) =>
          `<tr>` +
          `<td style="padding:8px 12px 8px 0;font-size:14px;color:${color.ink};border-top:1px solid ${color.edge};word-break:break-word;">` +
          `${escapeHtml(item.name)}<br>` +
          `<span style="font-size:13px;color:${color.inkSubtle};">${escapeHtml(
            item.quantity,
          )}</span>` +
          (item.note
            ? `<br><span style="font-size:13px;color:${color.inkSubtle};font-style:italic;">${escapeHtml(
                item.note,
              )}</span>`
            : '') +
          `</td>` +
          // Right-aligned and unwrapped: a column of amounts is read down.
          `<td style="padding:8px 0;font-size:14px;color:${color.ink};border-top:1px solid ${color.edge};text-align:right;white-space:nowrap;vertical-align:top;">${escapeHtml(
            item.total,
          )}</td>` +
          `</tr>`,
      )
      .join('');
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">${heading}${items}</table>`,
    );
  }

  if (content.action) {
    const url = actionUrl(content.action.path, branding);
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">` +
        `<tr><td style="border-radius:6px;background:${escapeHtml(
          branding.primaryColor,
        )};">` +
        `<a href="${escapeHtml(
          url,
        )}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(
          content.action.label,
        )}</a>` +
        `</td></tr></table>` +
        // Some clients strip a button's styling: the URL is also text.
        `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${color.inkSubtle};word-break:break-all;">${escapeHtml(
          url,
        )}</p>`,
    );
  }

  return `<!doctype html>
<html lang="${escapeHtml(branding.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${color.surface};font-family:${FONT};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    content.preheader,
  )}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${color.surface};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:${escapeHtml(
    branding.primaryColor,
  )};padding:20px 28px;font-size:18px;font-weight:700;color:#ffffff;">${escapeHtml(
    branding.name,
  )}</td></tr>
${renderNotice(branding)}<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${color.ink};">${escapeHtml(
    content.heading,
  )}</h1>
${parts.join('\n')}
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
<tr><td style="padding:16px 28px;font-size:12px;line-height:1.6;color:${color.inkSubtle};">
${escapeHtml(footerNote)}<br>
<a href="${escapeHtml(
    branding.shopUrl,
  )}" style="color:${color.inkSubtle};">${escapeHtml(branding.shopUrl)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The deployment's notice (FR-NAV-08) as a band under the wordmark, if any. */
function renderNotice(branding: MailBranding): string {
  const notice = branding.notice;
  if (!notice) return '';
  const color = branding.colors;
  const link = notice.link
    ? ` <a href="${escapeHtml(notice.link.url)}" style="color:${escapeHtml(
        branding.primaryColor,
      )};font-weight:600;">${escapeHtml(notice.link.label)}</a>`
    : '';
  return (
    `<tr><td style="background:${color.surfaceSubtle};border-bottom:1px solid ${color.edge};padding:10px 28px;font-size:13px;line-height:1.5;color:${color.ink};">` +
    `${escapeHtml(notice.text)}${link}</td></tr>\n`
  );
}

/** From the same content, not stripped from the HTML, so it stays readable. */
function renderText(
  content: MailContent,
  branding: MailBranding,
  footerNote: string,
): string {
  const blocks: string[] = [];
  if (branding.notice) {
    const { text, link } = branding.notice;
    blocks.push(link ? `${text}\n${link.label}: ${link.url}` : text);
  }
  blocks.push(content.heading);

  for (const paragraph of content.paragraphs ?? []) {
    blocks.push(paragraph);
  }
  if (content.rows?.length) {
    blocks.push(
      content.rows.map((row) => `${row.label}: ${row.value}`).join('\n'),
    );
  }
  if (content.items?.length) {
    const lines = content.items.map((item) =>
      [
        `${item.name} — ${item.quantity}: ${item.total}`,
        item.note ? `  ${item.note}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    blocks.push([content.itemsHeading, ...lines].filter(Boolean).join('\n'));
  }
  if (content.action) {
    blocks.push(
      `${content.action.label}: ${actionUrl(content.action.path, branding)}`,
    );
  }
  blocks.push(`--\n${branding.name}\n${footerNote}\n${branding.shopUrl}`);

  return blocks.join('\n\n');
}
