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

    it('keeps underline and strikethrough', () => {
      expect(sanitizeRichText('<p><u>a</u> <s>b</s></p>')).toBe(
        '<p><u>a</u> <s>b</s></p>',
      );
    });

    it('accepts every tag the shared vocabulary declares', () => {
      // Guards the two lists against drift: a tag added to RICH_TEXT_TAGS but
      // not reaching the sanitizer config would fail here.
      for (const tag of RICH_TEXT_TAGS) {
        let markup: string;
        if (tag === 'br' || tag === 'hr') {
          markup = `<${tag} />`;
        } else if (tag === 'img') {
          // img survives only with an allowed same-origin src.
          markup = '<img src="/media/abc123.webp" />';
        } else {
          markup = `<${tag}>x</${tag}>`;
        }
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

    it('strips tables, not part of the vocabulary yet', () => {
      const out = sanitizeRichText('<table><tr><td>cell</td></tr></table>');

      expect(out).not.toContain('<table');
      expect(out).not.toContain('<td');
    });

    it('strips iframes', () => {
      const out = sanitizeRichText('<iframe src="https://evil.test"></iframe>');

      expect(out).toBe('');
    });
  });

  describe('image safety', () => {
    it('keeps a same-origin /media/ image with alt', () => {
      const out = sanitizeRichText(
        '<img src="/media/abc123.webp" alt="A logo" />',
      );

      expect(out).toContain('src="/media/abc123.webp"');
      expect(out).toContain('alt="A logo"');
    });

    it('keeps a valid alignment and turns data-width into a pixel width style', () => {
      const out = sanitizeRichText(
        '<img src="/media/a.webp" alt="" data-align="right" data-width="300" />',
      );

      expect(out).toContain('data-align="right"');
      expect(out).toContain('data-width="300"');
      expect(out).toContain('width:300px');
    });

    it('drops an out-of-enum alignment but keeps the image', () => {
      const out = sanitizeRichText(
        '<img src="/media/a.webp" alt="" data-align="justify" />',
      );

      expect(out).toContain('src="/media/a.webp"');
      expect(out).not.toContain('data-align');
    });

    it('accepts pixel widths in range and drops out-of-range or non-integer', () => {
      for (const w of ['1', '1600']) {
        expect(
          sanitizeRichText(`<img src="/media/a.webp" data-width="${w}" />`),
        ).toContain(`width:${w}px`);
      }
      for (const bad of ['0', '1601', '50.5', '-5', '50px', 'abc']) {
        const out = sanitizeRichText(
          `<img src="/media/a.webp" data-width="${bad}" />`,
        );
        expect(out).not.toContain('width');
        expect(out).not.toContain('data-width');
      }
    });

    it('ignores an author-supplied style, emitting only its own width', () => {
      const out = sanitizeRichText(
        '<img src="/media/a.webp" data-width="200" style="position:fixed;width:9000px" />',
      );

      expect(out).toContain('width:200px');
      expect(out).not.toContain('position');
      expect(out).not.toContain('9000');
    });

    it('keeps a linked image and forces a safe rel on the wrapping anchor', () => {
      const out = sanitizeRichText(
        '<a href="https://shop.test"><img src="/media/a.webp" alt="Shop" /></a>',
      );

      expect(out).toContain('href="https://shop.test"');
      expect(out).toContain('rel="noopener noreferrer"');
      expect(out).toContain('src="/media/a.webp"');
    });

    it('drops a javascript: link around an image but keeps the image', () => {
      const out = sanitizeRichText(
        '<a href="javascript:alert(1)"><img src="/media/a.webp" /></a>',
      );

      expect(out).not.toContain('javascript');
      expect(out).toContain('src="/media/a.webp"');
    });

    it('forces an alt attribute even when none was supplied', () => {
      expect(sanitizeRichText('<img src="/media/a.webp" />')).toContain(
        'alt=""',
      );
    });

    it('drops an absolute-URL image (an exfiltration/tracking channel)', () => {
      expect(
        sanitizeRichText('<img src="https://evil.test/track.gif" alt="x" />'),
      ).toBe('');
    });

    it('drops a protocol-relative image src', () => {
      expect(sanitizeRichText('<img src="//evil.test/x.png" />')).toBe('');
    });

    it('drops a src that escapes the media prefix or adds a path segment', () => {
      expect(sanitizeRichText('<img src="/media/../secret" />')).toBe('');
      expect(sanitizeRichText('<img src="/media/sub/x.webp" />')).toBe('');
      expect(sanitizeRichText('<img src="/uploads/x.webp" />')).toBe('');
    });

    it('drops a javascript: image src', () => {
      expect(sanitizeRichText('<img src="javascript:alert(1)" />')).toBe('');
    });

    it('strips class, style and on* from an otherwise valid image', () => {
      const out = sanitizeRichText(
        '<img src="/media/a.webp" class="x" style="width:9000px" onerror="steal()" />',
      );

      expect(out).toContain('src="/media/a.webp"');
      expect(out).not.toContain('class');
      expect(out).not.toContain('style');
      expect(out).not.toContain('onerror');
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
