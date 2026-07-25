import { RICH_TEXT_TAGS } from '../lib/page.contract';
import { sanitizeRichText } from './sanitize-rich-text';

describe('sanitizeRichText', () => {
  describe('keeps the editor vocabulary intact', () => {
    it('preserves formatting, headings, lists and quotes unchanged', () => {
      const body = [
        '<h2>Delivery</h2>',
        '<p>Orders ship <strong>within</strong> <em>two</em> days.</p>',
        '<ul><li>Hamburg</li><li>EU</li></ul>',
        '<ol><li>Order</li><li>Invoice</li></ol>',
        '<blockquote><p>No coffee older than ten days.</p></blockquote>',
        '<hr />',
        '<h3>Pickup</h3><h4>By arrangement</h4>',
      ].join('');

      // Idempotent and lossless for content the editor can actually produce.
      expect(sanitizeRichText(body)).toBe(body);
    });

    it('leaves an empty body empty', () => {
      expect(sanitizeRichText('')).toBe('');
    });

    it('accepts every tag the shared vocabulary declares', () => {
      // Guards the two lists against drift: a tag added to RICH_TEXT_TAGS but
      // not reaching the sanitizer config would fail here.
      for (const tag of RICH_TEXT_TAGS) {
        const markup =
          tag === 'br' || tag === 'hr' ? `<${tag} />` : `<${tag}>x</${tag}>`;
        expect(sanitizeRichText(markup)).not.toBe('');
      }
    });
  });

  describe('strips what the vocabulary excludes', () => {
    it('removes script tags and their contents, leaving no source as prose', () => {
      const out = sanitizeRichText('<p>Hi</p><script>alert(1)</script>');

      expect(out).toBe('<p>Hi</p>');
      expect(out).not.toContain('alert');
    });

    it('removes event handler attributes but keeps the text', () => {
      expect(sanitizeRichText('<p onclick="steal()">Hello</p>')).toBe(
        '<p>Hello</p>',
      );
    });

    it('drops class and style attributes', () => {
      expect(
        sanitizeRichText('<p class="huge" style="color:red">Text</p>'),
      ).toBe('<p>Text</p>');
    });

    it('removes style blocks including their CSS', () => {
      const out = sanitizeRichText('<style>body{display:none}</style><p>A</p>');

      expect(out).toBe('<p>A</p>');
    });

    it('unwraps h1 so the page title stays the only h1', () => {
      const out = sanitizeRichText('<h1>Imposter title</h1>');

      expect(out).not.toContain('<h1');
      // The text survives; only the heading level is refused.
      expect(out).toContain('Imposter title');
    });

    it('strips tables (not part of the vocabulary yet, ADR 0020)', () => {
      const out = sanitizeRichText('<table><tr><td>cell</td></tr></table>');

      expect(out).not.toContain('<table');
      expect(out).not.toContain('<td');
    });

    it('strips iframes — embeds are code and config, never content (ADR 0010)', () => {
      const out = sanitizeRichText('<iframe src="https://evil.test"></iframe>');

      expect(out).toBe('');
    });

    it('strips images until the media store exists (ADR 0021)', () => {
      const out = sanitizeRichText('<img src="https://evil.test/track.gif" />');

      expect(out).toBe('');
    });
  });

  describe('link safety', () => {
    it('keeps http, https and mailto links and forces a safe rel', () => {
      for (const href of [
        'https://roastery.example',
        'http://roastery.example',
        'mailto:hello@roastery.example',
      ]) {
        const out = sanitizeRichText(`<a href="${href}">link</a>`);

        expect(out).toContain(`href="${href}"`);
        expect(out).toContain('rel="noopener noreferrer"');
      }
    });

    it('drops a javascript: href while keeping the link text', () => {
      const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');

      expect(out).not.toContain('javascript');
      expect(out).toContain('click');
    });

    it('drops a data: href', () => {
      const out = sanitizeRichText(
        '<a href="data:text/html,<script>alert(1)</script>">x</a>',
      );

      expect(out).not.toContain('data:');
    });

    it('drops a protocol-relative href', () => {
      const out = sanitizeRichText('<a href="//evil.test/phish">x</a>');

      expect(out).not.toContain('evil.test');
    });

    it('overwrites an author-supplied rel rather than trusting it', () => {
      const out = sanitizeRichText(
        '<a href="https://x.test" rel="dofollow">x</a>',
      );

      expect(out).toContain('rel="noopener noreferrer"');
      expect(out).not.toContain('dofollow');
    });

    it('refuses target, which could otherwise open a reverse-tabnabbing window', () => {
      const out = sanitizeRichText(
        '<a href="https://x.test" target="_blank">x</a>',
      );

      expect(out).not.toContain('target');
    });
  });

  it('is idempotent — re-sanitizing stored content changes nothing', () => {
    const once = sanitizeRichText(
      '<p onclick="x">Keep <a href="https://x.test">this</a></p><script>no</script>',
    );

    expect(sanitizeRichText(once)).toBe(once);
  });
});
