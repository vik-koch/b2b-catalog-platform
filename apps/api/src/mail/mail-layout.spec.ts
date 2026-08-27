import { demoMailBranding } from './mail-text.fixture';
import { MailContent, renderMail } from './mail-layout';

const content: MailContent = {
  subject: 'Subject line',
  preheader: 'Shown next to the subject',
  heading: 'Heading',
  paragraphs: ['First paragraph.', 'Second paragraph.'],
  rows: [{ label: 'Name', value: 'Jane Doe' }],
  action: { label: 'Open the shop', path: '/account' },
};

const render = (overrides: Partial<MailContent> = {}) =>
  renderMail({ ...content, ...overrides }, demoMailBranding, 'Footer note.');

describe('renderMail', () => {
  it('renders every part of the content into the HTML', () => {
    const { html, subject } = render();

    expect(subject).toBe('Subject line');
    expect(html).toContain('Shown next to the subject');
    expect(html).toContain('Heading');
    expect(html).toContain('First paragraph.');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('https://shop.example/account');
    expect(html).toContain('Footer note.');
    expect(html).toContain(demoMailBranding.name);
  });

  it('escapes content, so a submitted message cannot inject markup', () => {
    const { html } = render({
      rows: [{ label: 'Message', value: '<script>alert(1)</script>' }],
      paragraphs: ['a & b'],
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });

  it('references nothing external — remote content is blocked by default', () => {
    const { html } = render();

    // No image, stylesheet, font or script may be fetched when the mail opens;
    // the only outbound URL is the link the reader chooses to click.
    expect(html).not.toMatch(/<img|<script|<link|@import|url\(/i);
  });

  it('resolves an action path against the deployment origin', () => {
    const { html, text } = render({
      action: { label: 'Open the shop', path: '/admin/users' },
    });

    // Templates give a path; a mail is read outside the app, so what ships is
    // the absolute URL.
    expect(html).toContain('https://shop.example/admin/users');
    expect(text).toContain('https://shop.example/admin/users');
  });

  it('renders the same content as plain text, not stripped HTML', () => {
    const { text } = render();

    expect(text).not.toMatch(/[<>]/);
    expect(text).toContain('Heading');
    expect(text).toContain('First paragraph.');
    expect(text).toContain('Name: Jane Doe');
    // The button is a link the text reader must still be able to follow.
    expect(text).toContain('Open the shop: https://shop.example/account');
    expect(text).toContain('Footer note.');
  });

  // The repeating line-item block (ADR 0033, amended): the order mails' lines,
  // rendered by the layout so they are escaped and have a text part like
  // everything else.
  describe('line items', () => {
    const items = [
      {
        name: 'Espresso cups',
        quantity: '2 pk (12 pcs)',
        note: '100 in <red>',
        total: '99,90 €',
      },
      { name: 'Saucers', quantity: '3 pcs', total: '30,00 €' },
    ];

    it('renders each line with its quantity, note and amount', () => {
      const { html } = render({ items, itemsHeading: 'Your items' });

      expect(html).toContain('Your items');
      expect(html).toContain('Espresso cups');
      expect(html).toContain('2 pk (12 pcs)');
      expect(html).toContain('99,90 €');
      expect(html).toContain('Saucers');
    });

    // A line note is customer-typed (FR-CART-08) — the case the escaping in
    // this layout exists for.
    it('escapes a line note, so a typed one cannot inject markup', () => {
      const { html } = render({ items });

      expect(html).toContain('100 in &lt;red&gt;');
      expect(html).not.toContain('<red>');
    });

    it('states the same lines in the plain-text alternative', () => {
      const { text } = render({ items, itemsHeading: 'Your items' });

      expect(text).toContain('Your items');
      expect(text).toContain('Espresso cups — 2 pk (12 pcs): 99,90 €');
      // Verbatim here, not escaped: this part is text, and a reader of it
      // should see what the customer actually typed.
      expect(text).toContain('100 in <red>');
      expect(text).toContain('Saucers — 3 pcs: 30,00 €');
    });
  });

  it('omits the optional blocks a message does not use', () => {
    const { html, text } = render({
      paragraphs: undefined,
      rows: undefined,
      action: undefined,
    });

    expect(html).not.toContain('First paragraph.');
    expect(html).not.toContain('shop.example/account');
    expect(text).toContain('Heading');
    // The footer signature is still there — every message carries it.
    expect(text).toContain('Footer note.');
  });
});
